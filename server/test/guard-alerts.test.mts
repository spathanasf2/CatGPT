import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// scripts/guard-alerts.sh with a local state file and a stub alert command: what it sends, when it
// records progress, and that it never fails.
const SCRIPT = fileURLToPath(new URL("../scripts/guard-alerts.sh", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "aineko-guard-alerts-"));
const source = join(dir, "guard.json");
const sent = join(dir, "sent.txt");
const stub = join(dir, "alert.sh");
const stateDir = join(dir, "state");
let alertExit = 0;

function run(): string {
  writeFileSync(stub, `#!/bin/sh\nprintf '%s\\n---\\n' "$1" >> "${sent}"\nexit ${alertExit}\n`);
  chmodSync(stub, 0o755);
  return execFileSync("bash", [SCRIPT], {
    env: { ...process.env, GUARD_SOURCE: source, ALERT: stub, STATE_DIR: stateDir },
    encoding: "utf8",
  });
}

function state(events: { seq: number; kind: string; tag: string; until?: number | string; categories?: string[] }[]) {
  const seq = Math.max(0, ...events.map((e) => e.seq));
  writeFileSync(source, JSON.stringify({ seq, callers: {}, events: events.map((e) => ({ at: 0, tier: "free", categories: ["S10"], ...e })) }));
}

function alerts(): string {
  try {
    return readFileSync(sent, "utf8");
  } catch {
    return "";
  }
}

beforeEach(() => {
  rmSync(source, { force: true });
  rmSync(sent, { force: true });
  rmSync(stateDir, { recursive: true, force: true });
  alertExit = 0;
});

test("with no state yet, the first event ever is still alerted", () => {
  run(); // nothing flagged yet: the file does not exist
  state([{ seq: 1, kind: "help", tag: "aaaa1111", categories: ["S11"] }]);
  run();
  assert.match(alerts(), /Aineko self-harm flag \(free aaaa1111, S11\)/);
});

test("a first run against existing events only records where it is; each event alerts once", () => {
  state([{ seq: 1, kind: "lockout", tag: "bbbb2222", until: "indefinite" }]);
  run();
  assert.equal(alerts(), "");
  state([
    { seq: 1, kind: "lockout", tag: "bbbb2222", until: "indefinite" },
    { seq: 2, kind: "abuse", tag: "cccc3333", categories: ["S4"] },
  ]);
  run();
  run();
  assert.equal(alerts().match(/---/g)?.length, 1);
  assert.match(alerts(), /Aineko child-abuse flag \(free cccc3333, S4\)/);
  assert.doesNotMatch(alerts(), /bbbb2222/);
});

test("names the lift command on a lockout", () => {
  run();
  state([{ seq: 1, kind: "lockout", tag: "dddd4444", until: Date.parse("2026-10-24T12:00:00Z") }]);
  run();
  assert.match(alerts(), /until 2026-10-24 12:00 UTC\. Lift: ssh hetzner docker exec aineko node dist\/guard-cli\.js lift dddd4444/);
});

test("retries after a failed delivery, and counts the email fallback as delivered", () => {
  run();
  state([{ seq: 1, kind: "help", tag: "eeee5555" }]);
  alertExit = 1;
  assert.match(run(), /not delivered/);
  alertExit = 2;
  run();
  run();
  assert.equal(alerts().match(/eeee5555/g)?.length, 2);
});

test("a reset server state alerts everything it now holds", () => {
  run();
  state([1, 2, 3].map((seq) => ({ seq, kind: "help", tag: `ffff000${seq}` })));
  run();
  rmSync(sent);
  state([{ seq: 1, kind: "help", tag: "9999aaaa" }]);
  run();
  assert.match(alerts(), /9999aaaa/);
});

test("never fails, even on garbage", () => {
  writeFileSync(source, "not json");
  assert.match(run(), /state unreadable/);
});
