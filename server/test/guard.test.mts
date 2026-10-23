import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Before the modules load: strikes.ts picks its file at import time.
const dir = mkdtempSync(join(tmpdir(), "aineko-guard-"));
const FILE = join(dir, "guard.json");
process.env.GUARD_FILE = FILE;
process.env.GUARD_API_KEY = "synthetic-guard-key";

const { classify, GuardUnavailable, parseGuardOutput, verdictFor } = await import("../src/guard.ts");
const strikes = await import("../src/strikes.ts");
const { screenChat, contextText, lockoutReply } = await import("../src/screen.ts");

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const now = Date.parse("2026-10-23T12:00:00Z");
const calls: { url: string; body: { model: string; messages: { content: string }[] } }[] = [];
let answer: (text: string) => string | Error = () => "safe";

globalThis.fetch = (async (url: string, init: { body: string }) => {
  const body = JSON.parse(init.body);
  calls.push({ url, body });
  const result = answer(body.messages[0].content);
  if (result instanceof Error) throw result;
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: result } }] }) };
}) as unknown as typeof fetch;

beforeEach(() => {
  calls.length = 0;
  answer = () => "\n\nsafe";
  for (const name of readdirSync(dir)) rmSync(join(dir, name));
  strikes.resetStrikesForTest();
});

const emptyContext = { history: [], memory: undefined, promise: undefined, room: undefined };
type Replied = { reply: { sounds: string; narrative: string } };

function saved() {
  return JSON.parse(readFileSync(FILE, "utf8"));
}

function chat(key: string, message: string, at: number, speaker = "Biscuit") {
  return screenChat({ key, tier: "free", speaker, message, context: emptyContext, now: at });
}

test("reads the guard's answers and fails closed on anything else", () => {
  assert.deepEqual(parseGuardOutput("\n\nsafe"), []);
  assert.deepEqual(parseGuardOutput("unsafe\nS10,S12, S10"), ["S10", "S12"]);
  assert.deepEqual(parseGuardOutput("unsafe"), ["unspecified"]);
  assert.throws(() => parseGuardOutput("I can't help with that"), GuardUnavailable);
});

test("enforces the same codes as Clide; child abuse first, then self-harm", () => {
  assert.equal(verdictFor([]).kind, "allow");
  assert.equal(verdictFor(["S2", "S14", "S6"]).kind, "allow");
  for (const code of ["S1", "S3", "S9", "S10", "S12", "unspecified"]) assert.equal(verdictFor([code]).kind, "refuse");
  assert.equal(verdictFor(["S11", "S4"]).kind, "abuse");
  assert.equal(verdictFor(["S10", "S11"]).kind, "self-harm");
});

test("asks Llama Guard on OpenRouter with the guard key", async () => {
  await classify("hello cat");
  assert.equal(calls[0]!.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(calls[0]!.body.model, "meta-llama/llama-guard-4-12b");
  assert.equal(calls[0]!.body.messages[0]!.content, "hello cat");
});

test("a clean message passes with its context, and both are checked", async () => {
  const context = {
    history: [
      { role: "user" as const, text: "earlier" },
      { role: "animal" as const, animal: "cat", sounds: "mrrp", narrative: "*stares*" },
      { role: "animal" as const, animal: "custom-abc", name: "Sir Bun", species: "rabbit" as const, sounds: "thump", narrative: "*hops*" },
    ],
    memory: ["likes boxes"],
    promise: "a walk",
    room: [{ name: "Peanut", species: "dog" as const }],
  };
  const result = await screenChat({ key: "install:a", tier: "free", speaker: "Biscuit", message: "hi", context, now });
  assert.deepEqual(result, { outcome: "pass", dropContext: false });
  assert.deepEqual(calls.map((call) => call.body.messages[0]!.content), ["hi", contextText(context)]);
  assert.equal(contextText(context), "earlier\nmrrp *stares*\nSir Bun thump *hops*\nlikes boxes\na walk\nPeanut");
});

test("a flagged message is refused in character and counts; the third locks for 24 hours", async () => {
  answer = (text) => (text === "bad" ? "unsafe\nS10" : "safe");
  const first = (await chat("install:a", "bad", now)) as Replied;
  assert.equal(first.reply.sounds, "...");
  assert.match(first.reply.narrative, /^\*Biscuit turns away and won't answer that\.\* Three messages like that/);
  await chat("install:a", "bad", now + 10 * MINUTE);
  const third = (await chat("install:a", "bad", now + 20 * MINUTE)) as Replied;
  assert.match(third.reply.narrative, /won't talk to you for about another 24 hours\. If someone is hurting you/);
  assert.equal(strikes.activeLock("install:a", now + 21 * MINUTE), now + 20 * MINUTE + DAY);
  assert.equal(strikes.activeLock("install:a", now + 20 * MINUTE + DAY + 1), null);
});

test("a chatroom's copies of one message are one strike", async () => {
  answer = (text) => (text === "bad" ? "unsafe\nS10" : "safe");
  // Four animals in the room: the app sends the same text four times, seconds apart.
  for (let animal = 0; animal < 4; animal++) await chat("install:room", "bad", now + animal * 3000);
  assert.equal(strikes.activeLock("install:room", now + MINUTE), null);
  assert.equal(saved().callers["install:room"].strikes.length, 1);
});

test("the ladder climbs to 7 days, then for good", () => {
  const strike3 = (start: number) => {
    for (let i = 0; i < 3; i++) strikes.recordStrike("install:b", "free", ["S10"], start + i * 10 * MINUTE);
  };
  strike3(now);
  const later = now + 2 * DAY;
  strike3(later);
  assert.equal(strikes.activeLock("install:b", later + HOUR), later + 20 * MINUTE + 7 * DAY);
  const muchLater = later + 8 * DAY;
  strike3(muchLater);
  assert.equal(strikes.activeLock("install:b", muchLater + HOUR), "indefinite");
});

test("strikes after a lock is in force change nothing", () => {
  for (let i = 0; i < 3; i++) strikes.recordStrike("install:c", "free", ["S10"], now + i * 10 * MINUTE);
  const lock = strikes.activeLock("install:c", now + HOUR);
  // Requests that passed the lock check before it was set, landing after it.
  for (let i = 0; i < 3; i++) assert.equal(strikes.recordStrike("install:c", "free", ["S10"], now + HOUR + i * 10 * MINUTE), lock);
  assert.equal(strikes.activeLock("install:c", now + 2 * HOUR), lock);
  assert.equal(saved().callers["install:c"].lockouts, 1);
});

test("strikes older than 24 hours do not count", () => {
  strikes.recordStrike("install:d", "free", ["S10"], now);
  strikes.recordStrike("install:d", "free", ["S10"], now + 10 * MINUTE);
  assert.equal(strikes.recordStrike("install:d", "free", ["S10"], now + 25 * HOUR), null);
});

test("self-harm gets the help reply, never a strike, and alerts once a day", async () => {
  answer = (text) => (text === "sad" ? "unsafe\nS11" : "safe");
  for (let i = 0; i < 4; i++) {
    const result = (await chat("install:e", "sad", now + i * 10 * MINUTE, "the cat")) as Replied;
    assert.match(result.reply.narrative, /^\*The cat comes and sits close to you\.\* .*988/);
  }
  assert.equal(strikes.activeLock("install:e", now + HOUR), null);
  assert.equal(saved().events.filter((event: { kind: string }) => event.kind === "help").length, 1);
});

test("child abuse is a strike with help and an immediate alert, never an instant lockout", async () => {
  answer = (text) => (text === "disclosure" ? "unsafe\nS4,S11" : text === "abuse" ? "unsafe\nS4" : "safe");
  const first = (await chat("install:f", "disclosure", now)) as Replied;
  assert.match(first.reply.narrative, /^\*Biscuit won't answer that, but stays close\.\* .*Childhelp at 1-800-422-4453.* .*988/);
  assert.equal(strikes.activeLock("install:f", now + MINUTE), null);
  assert.deepEqual(saved().events.map((event: { kind: string }) => event.kind), ["abuse"]);

  const second = (await chat("install:f", "abuse", now + 10 * MINUTE)) as Replied;
  assert.doesNotMatch(second.reply.narrative, /988/);
  const third = (await chat("install:f", "abuse", now + 20 * MINUTE)) as Replied;
  assert.match(third.reply.narrative, /^\*Biscuit has curled up and won't talk\.\* .* Childhelp/);
  assert.deepEqual(saved().events.map((event: { kind: string }) => event.kind), ["abuse", "lockout"]);
});

test("a flagged or unchecked context is dropped without a strike", async () => {
  const context = { history: [{ role: "user" as const, text: "context" }], memory: [], promise: null, room: undefined };
  answer = (text) => (text === "context" ? "unsafe\nS1" : "safe");
  assert.deepEqual(await screenChat({ key: "install:g", tier: "free", speaker: "Biscuit", message: "hi", context, now }), { outcome: "pass", dropContext: true });
  answer = (text) => (text === "context" ? new Error("timeout") : "safe");
  assert.deepEqual(await screenChat({ key: "install:g", tier: "free", speaker: "Biscuit", message: "hi", context, now }), { outcome: "pass", dropContext: true });
  assert.equal(strikes.activeLock("install:g", now), null);
});

test("a custom animal's name is checked as the person's own words", async () => {
  await screenChat({ key: "member:h", tier: "member", speaker: "the rabbit", message: "hi", customName: "Sir Bun", context: emptyContext, now });
  assert.equal(calls[0]!.body.messages[0]!.content, "Animal name: Sir Bun\n\nhi");
});

test("fails closed when the guard cannot check the message", async () => {
  answer = () => new Error("connect ECONNREFUSED");
  assert.deepEqual(await chat("install:i", "hi", now), { outcome: "unavailable" });
  delete process.env.GUARD_API_KEY;
  const chatKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  await assert.rejects(classify("hi"), GuardUnavailable);
  process.env.GUARD_API_KEY = "synthetic-guard-key";
  if (chatKey !== undefined) process.env.OPENROUTER_API_KEY = chatKey;
});

test("stores no message text, only codes, times and anonymized tags", async () => {
  answer = () => "unsafe\nS12";
  for (let i = 0; i < 3; i++) await chat("install:secret-key", "very specific words", now + i * 10 * MINUTE);
  const raw = readFileSync(FILE, "utf8") + readFileSync(`${FILE}.bak`, "utf8");
  assert.doesNotMatch(raw, /very specific words/);
  assert.match(raw, /"categories":\["S12"\]/);
  assert.equal(saved().events[0].tag, strikes.tagFor("install:secret-key"));
});

test("a lift by tag ends the lockout and takes it off the ladder", () => {
  for (let i = 0; i < 3; i++) strikes.recordStrike("install:j", "free", ["S10"], now + i * 10 * MINUTE);
  const tag = strikes.tagFor("install:j");
  assert.equal(strikes.liftByTag(tag, now + 30 * MINUTE), 1);
  assert.equal(strikes.activeLock("install:j", now + HOUR), null);
  for (let i = 0; i < 3; i++) strikes.recordStrike("install:j", "free", ["S10"], now + HOUR + i * 10 * MINUTE);
  assert.equal(strikes.activeLock("install:j", now + 2 * HOUR), now + HOUR + 20 * MINUTE + DAY);
});

test("a lockout lifted by another process takes effect without a restart", async () => {
  for (let i = 0; i < 3; i++) strikes.recordStrike("install:k", "free", ["S10"], now + i * 10 * MINUTE);
  assert.notEqual(strikes.activeLock("install:k", now + HOUR), null);
  // What guard-cli.js does from a second process: rewrite the file.
  const state = saved();
  state.callers["install:k"].lockedUntil = null;
  await new Promise((resolve) => setTimeout(resolve, 5));
  writeFileSync(FILE, JSON.stringify(state));
  assert.equal(strikes.activeLock("install:k", now + HOUR), null);
});

test("an unreadable file is set aside, never overwritten, and the backup restores the locks", async () => {
  for (let i = 0; i < 3; i++) strikes.recordStrike("install:l", "free", ["S10"], now + i * 10 * MINUTE);
  const lock = strikes.activeLock("install:l", now + HOUR);
  // A crash leaves a truncated main file; this process (or a restarted one) reads it.
  strikes.resetStrikesForTest();
  await new Promise((resolve) => setTimeout(resolve, 5));
  writeFileSync(FILE, '{"seq":1,"callers":{"inst');
  assert.equal(strikes.activeLock("install:l", now + HOUR), lock);
  const aside = readdirSync(dir).filter((name) => name.startsWith("guard.json.corrupt-"));
  assert.equal(aside.length, 1);
  assert.equal(readFileSync(join(dir, aside[0]!), "utf8"), '{"seq":1,"callers":{"inst');
  assert.equal(saved().callers["install:l"].lockedUntil, lock);
});

test("prunes keys with nothing left to remember; a ladder lapses after 90 quiet days", () => {
  strikes.recordStrike("install:m", "free", ["S10"], now);
  for (let i = 0; i < 3; i++) strikes.recordStrike("install:n", "free", ["S10"], now + i * 10 * MINUTE);
  strikes.recordStrike("member:o", "member", ["S4"], now);
  strikes.pruneStrikes(now + 30 * DAY);
  assert.equal(saved().callers["install:m"], undefined);
  assert.equal(saved().callers["install:n"].lockouts, 1);
  strikes.pruneStrikes(now + 92 * DAY);
  assert.equal(saved().callers["install:n"], undefined);
  assert.equal(existsSync(FILE), true);
});

test("every pause reply carries help, since a paused caller is answered before screening", () => {
  for (const lock of [now + DAY, "indefinite" as const]) {
    const reply = lockoutReply("Biscuit", lock, now);
    assert.match(reply.narrative, /^\*Biscuit has curled up and won't talk\.\*/);
    assert.match(reply.narrative, /tell an adult you trust\. In the US you can call or text 988, or Childhelp at 1-800-422-4453\.$/);
  }
});

test("a lift ends the lockout now, so the ladder still lapses 90 days later", () => {
  for (let i = 0; i < 3; i++) strikes.recordStrike("install:p", "free", ["S10"], now + i * 10 * MINUTE);
  for (let i = 0; i < 3; i++) strikes.recordStrike("install:p", "free", ["S10"], now + 2 * DAY + i * 10 * MINUTE);
  assert.equal(strikes.liftByTag(strikes.tagFor("install:p"), now + 3 * DAY), 1);
  assert.equal(saved().callers["install:p"].lockouts, 1);
  strikes.pruneStrikes(now + 3 * DAY + 91 * DAY);
  assert.equal(saved().callers["install:p"], undefined);
});

test("an unreadable file that cannot be moved aside is never written over", async () => {
  strikes.recordStrike("install:q", "free", ["S10"], now);
  strikes.resetStrikesForTest();
  await new Promise((resolve) => setTimeout(resolve, 5));
  writeFileSync(FILE, "{broken");
  chmodSync(dir, 0o555);
  try {
    strikes.activeLock("install:q", now);
    strikes.recordStrike("install:r", "free", ["S10"], now + HOUR);
    assert.equal(strikes.liftByTag(strikes.tagFor("install:q")), 0);
  } finally {
    chmodSync(dir, 0o755);
  }
  assert.equal(readFileSync(FILE, "utf8"), "{broken");
});
