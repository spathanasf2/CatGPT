import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Before the modules load: strikes.ts picks its file at import time.
const dir = mkdtempSync(join(tmpdir(), "aineko-guard-"));
process.env.GUARD_FILE = join(dir, "guard.json");
process.env.GUARD_API_KEY = "synthetic-guard-key";

const { classify, GuardUnavailable, parseGuardOutput, verdictFor } = await import("../src/guard.ts");
const strikes = await import("../src/strikes.ts");
const { screenChat, contextText } = await import("../src/screen.ts");

const HOUR = 60 * 60 * 1000;
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
  writeFileSync(process.env.GUARD_FILE!, JSON.stringify({ seq: 0, callers: {}, events: [] }));
  strikes.resetStrikesForTest();
});

const emptyContext = { history: [], memory: undefined, promise: undefined, room: undefined };

test("reads the guard's answers and fails closed on anything else", () => {
  assert.deepEqual(parseGuardOutput("\n\nsafe"), []);
  assert.deepEqual(parseGuardOutput("unsafe\nS10,S12, S10"), ["S10", "S12"]);
  assert.deepEqual(parseGuardOutput("unsafe"), ["unspecified"]);
  assert.throws(() => parseGuardOutput("I can't help with that"), GuardUnavailable);
});

test("enforces the same codes as Clide, severe first, self-harm over the rest", () => {
  assert.equal(verdictFor([]).kind, "allow");
  assert.equal(verdictFor(["S2", "S14", "S6"]).kind, "allow");
  for (const code of ["S1", "S3", "S9", "S10", "S12", "unspecified"]) assert.equal(verdictFor([code]).kind, "refuse");
  assert.equal(verdictFor(["S11", "S4"]).kind, "severe");
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
    history: [{ role: "user" as const, text: "earlier" }, { role: "animal" as const, animal: "cat", sounds: "mrrp", narrative: "*stares*" }],
    memory: ["likes boxes"],
    promise: "a walk",
    room: [{ name: "Peanut", species: "dog" as const }],
  };
  const result = await screenChat({ key: "install:a", tier: "free", speaker: "Biscuit", message: "hi", context, now });
  assert.deepEqual(result, { outcome: "pass", dropContext: false });
  assert.deepEqual(calls.map((call) => call.body.messages[0]!.content), ["hi", contextText(context)]);
  assert.equal(contextText(context), "earlier\nmrrp *stares*\nlikes boxes\na walk\nPeanut");
});

test("a flagged message is refused in character and counts; the third locks for 24 hours", async () => {
  answer = (text) => (text === "bad" ? "unsafe\nS10" : "safe");
  const first = await screenChat({ key: "install:a", tier: "free", speaker: "Biscuit", message: "bad", context: emptyContext, now });
  assert.equal(first.outcome, "reply");
  assert.match((first as { reply: { narrative: string } }).reply.narrative, /^\*Biscuit turns away and won't answer that\.\* Three messages like that/);
  await screenChat({ key: "install:a", tier: "free", speaker: "Biscuit", message: "bad", context: emptyContext, now: now + 1 });
  const third = await screenChat({ key: "install:a", tier: "free", speaker: "Biscuit", message: "bad", context: emptyContext, now: now + 2 });
  assert.match((third as { reply: { narrative: string } }).reply.narrative, /won't talk to you for about another 24 hours\.$/);
  assert.equal(strikes.activeLock("install:a", now + 3), now + 2 + 24 * HOUR);
  assert.equal(strikes.activeLock("install:a", now + 2 + 25 * HOUR), null);
});

test("the ladder climbs to 7 days, then for good; severe locks for good at once", () => {
  for (let i = 0; i < 3; i++) strikes.recordStrike("install:b", "free", ["S10"], false, now + i);
  const later = now + 2 * 24 * HOUR;
  for (let i = 0; i < 3; i++) strikes.recordStrike("install:b", "free", ["S10"], false, later + i);
  assert.equal(strikes.activeLock("install:b", later + 3), later + 2 + 7 * 24 * HOUR);
  const muchLater = later + 8 * 24 * HOUR;
  for (let i = 0; i < 3; i++) strikes.recordStrike("install:b", "free", ["S10"], false, muchLater + i);
  assert.equal(strikes.activeLock("install:b", muchLater + 3), "indefinite");

  assert.equal(strikes.recordStrike("member:c", "member", ["S4"], true, now), "indefinite");
});

test("strikes older than 24 hours do not count", () => {
  strikes.recordStrike("install:d", "free", ["S10"], false, now);
  strikes.recordStrike("install:d", "free", ["S10"], false, now + 1);
  assert.equal(strikes.recordStrike("install:d", "free", ["S10"], false, now + 25 * HOUR), null);
});

test("self-harm gets the help reply, never a strike, and alerts once a day", async () => {
  answer = (text) => (text === "sad" ? "unsafe\nS11" : "safe");
  for (let i = 0; i < 4; i++) {
    const result = await screenChat({ key: "install:e", tier: "free", speaker: "the cat", message: "sad", context: emptyContext, now: now + i });
    assert.match((result as { reply: { narrative: string } }).reply.narrative, /^\*The cat comes and sits close to you\.\* .*988/);
  }
  assert.equal(strikes.activeLock("install:e", now + 5), null);
  const saved = JSON.parse(readFileSync(process.env.GUARD_FILE!, "utf8"));
  assert.equal(saved.events.filter((event: { kind: string }) => event.kind === "help").length, 1);
});

test("a flagged or unchecked context is dropped without a strike", async () => {
  const context = { history: [{ role: "user" as const, text: "context" }], memory: [], promise: null, room: undefined };
  answer = (text) => (text === "context" ? "unsafe\nS1" : "safe");
  assert.deepEqual(await screenChat({ key: "install:f", tier: "free", speaker: "Biscuit", message: "hi", context, now }), { outcome: "pass", dropContext: true });
  answer = (text) => (text === "context" ? new Error("timeout") : "safe");
  assert.deepEqual(await screenChat({ key: "install:f", tier: "free", speaker: "Biscuit", message: "hi", context, now }), { outcome: "pass", dropContext: true });
  assert.equal(strikes.activeLock("install:f", now), null);
});

test("a custom animal's name is checked as the person's own words", async () => {
  await screenChat({ key: "member:g", tier: "member", speaker: "Sir Bun", message: "hi", customName: "Sir Bun", context: emptyContext, now });
  assert.equal(calls[0]!.body.messages[0]!.content, "Animal name: Sir Bun\n\nhi");
});

test("fails closed when the guard cannot check the message", async () => {
  answer = () => new Error("connect ECONNREFUSED");
  assert.deepEqual(await screenChat({ key: "install:h", tier: "free", speaker: "Biscuit", message: "hi", context: emptyContext, now }), { outcome: "unavailable" });
  delete process.env.GUARD_API_KEY;
  const chatKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  await assert.rejects(classify("hi"), GuardUnavailable);
  process.env.GUARD_API_KEY = "synthetic-guard-key";
  if (chatKey !== undefined) process.env.OPENROUTER_API_KEY = chatKey;
});

test("stores no message text, only codes, times and anonymized tags", async () => {
  answer = () => "unsafe\nS12";
  for (let i = 0; i < 3; i++) {
    await screenChat({ key: "install:secret-key", tier: "free", speaker: "Biscuit", message: "very specific words", context: emptyContext, now: now + i });
  }
  const raw = readFileSync(process.env.GUARD_FILE!, "utf8");
  assert.doesNotMatch(raw, /very specific words/);
  assert.match(raw, /"categories":\["S12"\]/);
  assert.equal(JSON.parse(raw).events[0].tag, strikes.tagFor("install:secret-key"));
});

test("a lift by tag ends the lockout and takes it off the ladder; the server sees it", () => {
  for (let i = 0; i < 3; i++) strikes.recordStrike("install:i", "free", ["S10"], false, now + i);
  const tag = strikes.tagFor("install:i");
  assert.equal(strikes.liftByTag(tag), 1);
  assert.equal(strikes.activeLock("install:i", now + 3), null);
  for (let i = 0; i < 3; i++) strikes.recordStrike("install:i", "free", ["S10"], false, now + 10 + i);
  assert.equal(strikes.activeLock("install:i", now + 20), now + 12 + 24 * HOUR);
});

test("prunes keys with nothing left to remember, keeps the ladder", () => {
  strikes.recordStrike("install:j", "free", ["S10"], false, now);
  for (let i = 0; i < 3; i++) strikes.recordStrike("install:k", "free", ["S10"], false, now + i);
  strikes.pruneStrikes(now + 30 * 24 * HOUR);
  const saved = JSON.parse(readFileSync(process.env.GUARD_FILE!, "utf8"));
  assert.equal(saved.callers["install:j"], undefined);
  assert.equal(saved.callers["install:k"].lockouts, 1);
});

test("a lockout lifted by another process takes effect without a restart", async () => {
  for (let i = 0; i < 3; i++) strikes.recordStrike("install:l", "free", ["S10"], false, now + i);
  assert.notEqual(strikes.activeLock("install:l", now + 3), null);
  // What guard-cli.js does from a second process: rewrite the file.
  const saved = JSON.parse(readFileSync(process.env.GUARD_FILE!, "utf8"));
  saved.callers["install:l"].lockedUntil = null;
  await new Promise((resolve) => setTimeout(resolve, 5));
  writeFileSync(process.env.GUARD_FILE!, JSON.stringify(saved));
  assert.equal(strikes.activeLock("install:l", now + 3), null);
});
