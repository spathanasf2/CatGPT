import express from "express";
import { bearerAuth } from "./auth.js";
import { log } from "./log.js";
import { askAnimal } from "./openrouter.js";
import { ANIMALS, isAnimalId } from "./animals.js";
import { parseHistory } from "./history.js";
import { MODELS, isAllowedModel } from "./models.js";
import { getUsage } from "./usage.js";
import { landingHtml, privacyHtml, termsHtml } from "./pages.js";
import { rateLimit } from "./rate-limit.js";
import { checkBudget, flushBudget } from "./token-budget.js";

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
// Per-IP cost ceiling, sized off real measured usage (~439 tokens/request) against the $0.99/mo
// price and gemini-2.5-flash-lite's actual per-token cost: break-even is ~7.6M tokens/month, this
// keeps every subscriber's worst-case cost near $0.65 against $0.99 revenue -- a bounded, chosen
// loss instead of an unbounded one. Weekly is monthly/4, same ratio as the plan it was derived from.
const MONTHLY_TOKEN_LIMIT = envInt("MONTHLY_TOKEN_LIMIT", 5_000_000);
const WEEKLY_TOKEN_LIMIT = envInt("WEEKLY_TOKEN_LIMIT", 1_250_000);
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
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
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

app.get("/health", (_req, res) => {
  res.json({ ok: true, animals: Object.keys(ANIMALS) });
});

app.get("/models", bearerAuth(TOKEN), (_req, res) => {
  res.json({ models: MODELS, default: process.env.OPENROUTER_MODEL || MODELS[0]!.id });
});

app.get("/usage", bearerAuth(TOKEN), (_req, res) => {
  res.json({ ...getUsage(), budgetTokens: USAGE_TOKEN_BUDGET });
});

// 20 req/min/IP: generous for a human typing, tight enough to stop a script hammering the paid
// endpoint. Blind to content by design -- only ever sees request counts, never message text.
const chatRateLimit = rateLimit(20, 60_000);

app.post("/chat", chatRateLimit, bearerAuth(TOKEN), async (req, res) => {
  const { animal, message, model, history: rawHistory } = req.body ?? {};
  if (!isAnimalId(animal)) {
    res.status(400).json({ error: `animal must be one of: ${Object.keys(ANIMALS).join(", ")}` });
    return;
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
  const clientIp = req.ip ?? "unknown";
  const budget = checkBudget(clientIp, WEEKLY_TOKEN_LIMIT, MONTHLY_TOKEN_LIMIT);
  if (!budget.allowed) {
    res.status(429).json({ error: budget.reason });
    return;
  }
  // `res` "close" also fires after a normal response, so only an unfinished response counts as the
  // client walking away (req "close" is no good here -- it fires once the body has been read).
  const disconnected = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) disconnected.abort();
  });
  try {
    const reply = await askAnimal(animal, message.trim(), clientIp, {
      history,
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

const server = app.listen(PORT, () => {
  log.info("listening", { port: PORT, trustProxyHops: TRUST_PROXY_HOPS });
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
