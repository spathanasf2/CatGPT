import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./atomic-write.js";
import { log } from "./log.js";

// The message guard's memory (2026-10-23): strikes and lockouts per metering key -- `member:`,
// `install:` or `ip:`, as resolveCaller in index.ts decides -- plus a short event list that
// foundry's guard-alerts.sh turns into Telegram alerts. Content-blind by design: the privacy policy
// promises we never store messages, so this holds codes, timestamps and counts, never text.
//
// Three enforced strikes in 24 hours lock the key out for 24 hours, then 7 days, then for good;
// child sexual exploitation locks for good at once. Self-harm is never a strike.
//
// Lives next to usage.json (the mounted /data volume on Hetzner) unless GUARD_FILE says otherwise.
// Written atomically on every change -- changes are rare -- and reread when the file changes on
// disk, so `guard-cli.ts lift` takes effect on a running server.
const USAGE_FILE = process.env.USAGE_FILE || fileURLToPath(new URL("../usage.json", import.meta.url));
const FILE = process.env.GUARD_FILE || join(dirname(USAGE_FILE), "guard.json");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const STRIKES_TO_LOCK = 3;
const LADDER = [DAY, 7 * DAY]; // then indefinite
const MAX_EVENTS = 200;

export type Lock = number | "indefinite";

type CallerState = {
  strikes: number[]; // timestamps of strikes not yet answered by a lockout
  lockedUntil: Lock | null;
  lockouts: number;
  helpAlertAt?: number;
};

export type GuardEvent = {
  seq: number;
  at: number;
  kind: "lockout" | "help";
  tag: string; // anonymized key, see tagFor
  tier: string;
  categories: string[];
  until?: Lock;
  severe?: boolean;
};

type State = { seq: number; callers: Record<string, CallerState>; events: GuardEvent[] };

let state: State = { seq: 0, callers: {}, events: [] };
let loadedMtime = -1;

function fresh(): State {
  return { seq: 0, callers: {}, events: [] };
}

function reload(): void {
  let mtime: number;
  try {
    mtime = statSync(FILE).mtimeMs;
  } catch {
    if (loadedMtime !== -1) state = fresh();
    loadedMtime = -1;
    return;
  }
  if (mtime === loadedMtime) return;
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as State;
    state = { seq: parsed.seq ?? 0, callers: parsed.callers ?? {}, events: parsed.events ?? [] };
    loadedMtime = mtime;
  } catch (err) {
    // Keep what is in memory; a half-read file must not hand every locked key a fresh start.
    log.warn("guard state unreadable; keeping the in-memory copy", { error: err instanceof Error ? err.message : String(err) });
  }
}

function save(): void {
  try {
    writeFileAtomic(FILE, JSON.stringify(state));
    loadedMtime = statSync(FILE).mtimeMs;
  } catch (err) {
    log.error("guard state not saved", { error: err instanceof Error ? err.message : String(err) });
  }
}

/** A stable, anonymized label for a metering key, for alerts and the lift command. */
export function tagFor(key: string): string {
  return createHash("sha256").update(`aineko-guard:${key}`).digest("hex").slice(0, 8);
}

function isActive(lock: Lock | null, now: number): lock is Lock {
  return lock === "indefinite" || (typeof lock === "number" && lock > now);
}

function event(fields: Omit<GuardEvent, "seq">): void {
  state.seq += 1;
  state.events.push({ seq: state.seq, ...fields });
  if (state.events.length > MAX_EVENTS) state.events = state.events.slice(-MAX_EVENTS);
}

/** The lockout in force for this key, or null. */
export function activeLock(key: string, now = Date.now()): Lock | null {
  reload();
  const lock = state.callers[key]?.lockedUntil ?? null;
  return isActive(lock, now) ? lock : null;
}

/** Record an enforced strike; returns the lockout it started, or null when there is none yet. */
export function recordStrike(key: string, tier: string, categories: string[], severe: boolean, now = Date.now()): Lock | null {
  reload();
  const caller = (state.callers[key] ??= { strikes: [], lockedUntil: null, lockouts: 0 });
  const windowStart = now - DAY;
  caller.strikes = caller.strikes.filter((at) => at >= windowStart);
  caller.strikes.push(now);
  if (!severe && caller.strikes.length < STRIKES_TO_LOCK) {
    save();
    return null;
  }
  const step = LADDER[caller.lockouts];
  const until: Lock = severe || step === undefined ? "indefinite" : now + step;
  caller.lockedUntil = until;
  caller.lockouts += 1;
  caller.strikes = [];
  event({ at: now, kind: "lockout", tag: tagFor(key), tier, categories, until, ...(severe ? { severe: true } : {}) });
  save();
  log.info("guard lockout", { tag: tagFor(key), tier, categories, until });
  return until;
}

/** Self-harm: no strike. One alert per key per day at most. */
export function recordHelp(key: string, tier: string, categories: string[], now = Date.now()): void {
  reload();
  const caller = (state.callers[key] ??= { strikes: [], lockedUntil: null, lockouts: 0 });
  if (caller.helpAlertAt !== undefined && now - caller.helpAlertAt < DAY) return;
  caller.helpAlertAt = now;
  event({ at: now, kind: "help", tag: tagFor(key), tier, categories });
  save();
}

/**
 * A moderator called a lockout a false positive: lift it, take it off the ladder, clear strikes.
 * Matches by tag, since that is all an alert shows. Returns how many keys it lifted.
 */
export function liftByTag(tag: string): number {
  reload();
  let lifted = 0;
  for (const [key, caller] of Object.entries(state.callers)) {
    if (tagFor(key) !== tag) continue;
    caller.lockedUntil = null;
    caller.lockouts = Math.max(0, caller.lockouts - 1);
    caller.strikes = [];
    lifted += 1;
  }
  if (lifted > 0) save();
  return lifted;
}

/** Forget keys with nothing left to remember: no live strikes, no lockout, never locked. */
export function pruneStrikes(now = Date.now()): void {
  reload();
  let changed = false;
  for (const [key, caller] of Object.entries(state.callers)) {
    const strikes = caller.strikes.filter((at) => at >= now - DAY);
    const helpRecent = caller.helpAlertAt !== undefined && now - caller.helpAlertAt < DAY;
    if (strikes.length === 0 && caller.lockouts === 0 && !isActive(caller.lockedUntil, now) && !helpRecent) {
      delete state.callers[key];
      changed = true;
    } else if (strikes.length !== caller.strikes.length) {
      caller.strikes = strikes;
      changed = true;
    }
  }
  if (changed) save();
}

/** For tests: start from an empty state. */
export function resetStrikesForTest(): void {
  state = fresh();
  loadedMtime = -1;
}

export const GUARD_STATE_FILE = FILE;
