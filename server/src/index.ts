import express from "express";
import { bearerAuth } from "./auth.js";
import { log } from "./log.js";
import { askAnimal } from "./openrouter.js";
import { ANIMALS, resolveAnimal, type Animal } from "./animals.js";
import { customAnimal, parseCustom } from "./custom.js";
import { parseHistory, parseMemory, parsePromise, parseRoom } from "./history.js";
import { parseBond } from "./bond.js";
import { MODELS, isAllowedModel } from "./models.js";
import { getUsage, recordShareLinkHit } from "./usage.js";
import { landingHtml, privacyHtml, termsHtml } from "./pages.js";
import { rateLimit } from "./rate-limit.js";
import { checkBudget, flushBudget, peekBudget } from "./token-budget.js";
import { verifyMembershipCached } from "./entitlement.js";
import { FREE_LIMITS, IP_BACKSTOP_LIMITS, LIMITS_SUMMARY, MEMBER_LIMITS, type Limits, type Tier } from "./limits.js";
import { lockoutReply, screenChat } from "./screen.js";
import { activeLock, pruneStrikes } from "./strikes.js";

function envStr(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
}

const PORT = envInt("PORT", 8788);
const TOKEN = envStr("AUTH_TOKEN");
envStr("OPENROUTER_API_KEY"); // fail fast at boot, not on first request
// Placeholder starting allowance so the usage page has something to compare against --
// real budgets/pricing get decided later, this just proves the counting is accurate.
const USAGE_TOKEN_BUDGET = envInt("USAGE_TOKEN_BUDGET", 100_000);
// How many reverse proxies sit in front of this process. foundry: 1 (Tailscale Serve). Hetzner: 2
// (Cloudflare -> Caddy, with Caddy set to trust Cloudflare's forwarded-for). Must match reality:
// too low and every user is bucketed under a proxy's IP; `true` (trust everything) takes the
// left-most X-Forwarded-For entry, which the client itself controls.
const TRUST_PROXY_HOPS = envInt("TRUST_PROXY_HOPS", 1);

const app = express();
// Both deployments sit behind reverse proxies -- without this, req.ip is always the nearest
// proxy's address and the rate limiter + token budget would lump every caller into one bucket.
app.set("trust proxy", TRUST_PROXY_HOPS);
app.use(express.json({ limit: "32kb" }));

app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Aineko-Install, X-Aineko-Membership");
  res.setHeader("Access-Control-Max-Age", "86400");
  next();
});

app.options("/{*splat}", (_req, res) => {
  res.sendStatus(204);
});

function sendPage(res: express.Response, html: string): void {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.type("html").send(html);
}

// Support/marketing page for App Store Connect, and the privacy policy App Review requires.
// Public, no auth.
app.get("/", (_req, res) => sendPage(res, landingHtml(process.env.APP_STORE_URL || undefined)));
app.get("/privacy", (_req, res) => sendPage(res, privacyHtml()));
app.get("/terms", (_req, res) => sendPage(res, termsHtml()));

// The link shared reply cards carry. Counts the tap (a bare number) and sends people to the App
// Store listing once APP_STORE_URL is set -- ideally an App Analytics campaign link
// (...?pt=<provider>&ct=sharecard) so Apple attributes the downloads -- or to the landing page
// until then. Lets the app ship this link before the listing exists.
app.get("/get", (_req, res) => {
  recordShareLinkHit();
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, process.env.APP_STORE_URL || "/");
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, animals: Object.keys(ANIMALS) });
});

// Who a request is metered as. Members: their verified subscription (follows them across networks
// and reinstalls). Free: the random install ID the app generates, plus a generous per-IP backstop
// so minting fresh IDs doesn't mint fresh allowances. No install ID (builds 1.0 (1)-(9)): per-IP
// at free limits, which is how everything was metered before 2026-09-22.
type Caller = { tier: Tier; usageKey: string; limits: Limits; checks: [string, Limits][] };

const INSTALL_ID = /^[0-9a-f]{32}$/;

function resolveCaller(req: express.Request): Caller {
  const jws = req.header("x-aineko-membership");
  const member = jws ? verifyMembershipCached(jws) : null;
  if (member) {
    const key = `member:${member.originalTransactionId}`;
    return { tier: "member", usageKey: key, limits: MEMBER_LIMITS, checks: [[key, MEMBER_LIMITS]] };
  }
  const ipKey = `ip:${req.ip ?? "unknown"}`;
  const install = req.header("x-aineko-install");
  if (install && INSTALL_ID.test(install)) {
    const key = `install:${install}`;
    return {
      tier: "free",
      usageKey: key,
      limits: FREE_LIMITS,
      checks: [
        [key, FREE_LIMITS],
        [ipKey, IP_BACKSTOP_LIMITS],
      ],
    };
  }
  return { tier: "free", usageKey: ipKey, limits: FREE_LIMITS, checks: [[ipKey, FREE_LIMITS]] };
}

app.get("/models", bearerAuth(TOKEN), (_req, res) => {
  res.json({ models: MODELS, default: process.env.OPENROUTER_MODEL || MODELS[0]!.id });
});

// App-wide totals. Ops only -- builds 1.0 (1)-(9) showed this in Settings > Usage; newer builds
// show GET /usage/me instead.
app.get("/usage", bearerAuth(TOKEN), (_req, res) => {
  res.json({ ...getUsage(), budgetTokens: USAGE_TOKEN_BUDGET });
});

// The caller's own allowance, for Settings > Usage.
app.get("/usage/me", bearerAuth(TOKEN), (req, res) => {
  const caller = resolveCaller(req);
  res.json({ tier: caller.tier, ...peekBudget(caller.usageKey, caller.limits) });
});

// 40 req/min/IP: generous for a human typing -- a chatroom of four animals is four requests per
// message (1.3) -- and still tight enough to stop a script hammering the paid endpoint; the token
// budgets are what actually bound cost. Blind to content by design -- only ever counts requests.
const chatRateLimit = rateLimit(40, 60_000);

app.post("/chat", chatRateLimit, bearerAuth(TOKEN), async (req, res) => {
  const {
    animal,
    custom: rawCustom,
    message,
    model,
    history: rawHistory,
    memory: rawMemory,
    bond: rawBond,
    room: rawRoom,
    promise: rawPromise,
  } = req.body ?? {};
  // Either a built-in (by id) or a custom animal the app describes in full (members only).
  let character: Animal;
  let legacy = false;
  if (rawCustom !== undefined) {
    const spec = parseCustom(rawCustom);
    if (!spec || spec.id !== animal) {
      res.status(400).json({ error: "custom animal is invalid" });
      return;
    }
    character = customAnimal(spec);
  } else {
    const resolved = resolveAnimal(animal);
    if (!resolved) {
      res.status(400).json({ error: `animal must be one of: ${Object.keys(ANIMALS).join(", ")}` });
      return;
    }
    character = ANIMALS[resolved.id];
    legacy = resolved.legacy;
  }
  if (typeof message !== "string" || !message.trim() || message.length > 2000) {
    res.status(400).json({ error: "message must be a non-empty string up to 2000 chars" });
    return;
  }
  if (model !== undefined && !isAllowedModel(model)) {
    res.status(400).json({ error: `model must be one of: ${MODELS.map((m) => m.id).join(", ")}` });
    return;
  }
  const history = parseHistory(rawHistory);
  if (!history) {
    res.status(400).json({ error: "history must be an array of up to 20 prior user/animal messages" });
    return;
  }
  const memory = parseMemory(rawMemory);
  if (memory === null) {
    res.status(400).json({ error: "memory must be an array of up to 20 strings" });
    return;
  }
  const bond = parseBond(rawBond);
  if (bond === "invalid") {
    res.status(400).json({ error: "bond must be null or an integer from -10 to 10" });
    return;
  }
  const room = parseRoom(rawRoom);
  if (room === null) {
    res.status(400).json({ error: "room must list 1 to 3 other animals" });
    return;
  }
  const promise = parsePromise(rawPromise);
  if (promise === "invalid") {
    res.status(400).json({ error: "promise must be null or a short string" });
    return;
  }
  const caller = resolveCaller(req);
  const speaker = legacy ? `the ${character.species}` : character.name;
  if (character.membersOnly && caller.tier !== "member") {
    res.status(403).json({ error: `${speaker} is a members-only animal`, code: "members-only" });
    return;
  }
  // Locked out by the message guard (strikes.ts): answered in character, before anything is spent.
  const lock = activeLock(caller.usageKey);
  if (lock !== null) {
    res.json(lockoutReply(speaker, lock));
    return;
  }
  for (const [key, limits] of caller.checks) {
    const budget = checkBudget(key, limits);
    if (!budget.allowed) {
      res.status(429).json({
        error: budget.reason,
        code: "quota",
        tier: caller.tier,
        window: budget.window,
        resetAt: new Date(budget.resetAt).toISOString(),
      });
      return;
    }
  }
  // The message guard (screen.ts): nothing reaches the animal's model until it has passed. A
  // refusal, lockout or the self-harm help is the reply; a flagged context is left out.
  const screening = await screenChat({
    key: caller.usageKey,
    tier: caller.tier,
    speaker,
    message: message.trim(),
    customName: rawCustom !== undefined ? character.name : undefined,
    context: { history, memory, promise, room },
  });
  if (screening.outcome === "unavailable") {
    log.warn("guard unavailable; chat refused");
    res.status(503).json({ error: "the animal didn't respond (safety check unavailable)" });
    return;
  }
  if (screening.outcome === "reply") {
    res.json(screening.reply);
    return;
  }
  const keep = !screening.dropContext;
  // `res` "close" also fires after a normal response, so only an unfinished response counts as the
  // client walking away (req "close" is no good here -- it fires once the body has been read).
  const disconnected = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) disconnected.abort();
  });
  try {
    const reply = await askAnimal(character, message.trim(), {
      legacy,
      memory: keep || memory === undefined ? memory : [],
      bond,
      room: keep ? room : undefined,
      promise: keep || promise === undefined ? promise : null,
      budgetKeys: caller.checks.map(([key]) => key),
      history: keep ? history : [],
      modelOverride: model,
      signal: disconnected.signal,
    });
    res.json(reply);
  } catch (err) {
    if (disconnected.signal.aborted) {
      log.info("client disconnected before reply");
      return;
    }
    log.error("chat failed", { error: err instanceof Error ? err.message : String(err) });
    res.status(502).json({ error: "the animal didn't respond (upstream error)" });
  }
});

// Keys the guard has nothing left to remember about (strikes.ts).
setInterval(() => pruneStrikes(), 60 * 60 * 1000).unref();

const server = app.listen(PORT, () => {
  log.info("listening", { port: PORT, trustProxyHops: TRUST_PROXY_HOPS, limits: LIMITS_SUMMARY });
});

// Docker and systemd both stop with SIGTERM. Let in-flight replies finish (they record their token
// spend on the way out), then flush the budget file -- it otherwise only flushes once a minute.
function shutdown(signal: string): void {
  log.info("shutting down", { signal });
  const exit = () => {
    flushBudget();
    process.exit(0);
  };
  server.close(exit);
  setTimeout(exit, 8_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
