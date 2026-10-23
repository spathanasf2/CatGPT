import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { log } from "../src/log.ts";

const lines: string[] = [];
const original = { log: console.log, error: console.error };
console.log = (line: string) => void lines.push(line);
console.error = (line: string) => void lines.push(line);
afterEach(() => {
  lines.length = 0;
});
process.on("exit", () => Object.assign(console, original));

// The shape openrouter.ts throws: `openrouter <status> (<model>): <first 300 chars of the body>`.
function upstream(status: number, body: object, cut = 300): string {
  return `openrouter ${status} (openai/gpt-4.1-nano): ${JSON.stringify(body).slice(0, cut)}`;
}

test("a moderation error never logs the flagged text", () => {
  const error = upstream(403, {
    error: {
      message: "Input was flagged",
      code: 403,
      metadata: { reasons: ["harassment"], flagged_input: "the words a kid typed", provider_name: "OpenAI", model_slug: "gpt-4.1-nano" },
    },
  });
  log.warn("model failed, trying next fallback", { model: "openai/gpt-4.1-nano", error });
  const entry = JSON.parse(lines[0]!);
  assert.doesNotMatch(lines[0]!, /the words a kid typed/);
  assert.match(entry.error, /^openrouter 403 \(openai\/gpt-4\.1-nano\): \{"error":\{"message":"Input was flagged","code":403,"metadata":"\[removed: may quote the message\]"$/);
});

test("a raw provider payload is removed even when the excerpt is cut mid-JSON", () => {
  const error = upstream(400, { error: { message: "Provider returned error", code: 400, metadata: { raw: `{"prompt":"${"x".repeat(400)}"}` } } });
  log.error("chat failed", { error });
  assert.doesNotMatch(lines[0]!, /xxxx/);
  assert.match(JSON.parse(lines[0]!).error, /"code":400,"metadata":"\[removed/);
});

test("errors without metadata, and every other field, are untouched", () => {
  log.info("listening", { port: 8788, error: "openrouter 502 (m): bad gateway" });
  assert.deepEqual(
    { port: JSON.parse(lines[0]!).port, error: JSON.parse(lines[0]!).error },
    { port: 8788, error: "openrouter 502 (m): bad gateway" },
  );
});
