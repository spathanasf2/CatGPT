import { createHash } from "node:crypto";
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, statSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "./log.js";

// The message guard's memory (2026-10-23): strikes and lockouts per metering key -- `member:`,
// `install:` or `ip:`, as resolveCaller in index.ts decides -- plus a short event list that
// foundry's guard-alerts.sh turns into Telegram alerts. Content-blind by design: the privacy policy
// promises we never store messages, so this holds codes, timestamps and counts, never text.
//
// Three strikes in 24 hours lock the key out for 24 hours, then 7 days, then for good. A chatroom
// sends one message once per animal, so strikes closer together than STRIKE_SPACING count once.
// Self-harm is never a strike; child sexual exploitation is a strike that alerts at once.
//
// Lives next to usage.json (the mounted /data volume on Hetzner) unless GUARD_FILE says otherwise.
// Written (fsynced, then renamed) on every change -- changes are rare -- with the previous good
// copy kept as .bak, and reread when the file changes on disk, so `guard-cli.ts lift` takes effect
// on a running server. A file that will not parse is set aside, never overwritten.
const USAGE_FILE = process.env.USAGE_FILE || fileURLToPath(new URL("../usage.json", import.meta.url));
const FILE = process.env.GUARD_FILE || join(dirname(USAGE_FILE), "guard.json");
const BACKUP = `${FILE}.bak`;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const STRIKES_TO_LOCK = 3;
const STRIKE_SPACING = 2 * 60 * 1000;
const LADDER = [DAY, 7 * DAY]; // then indefinite
const LADDER_LAPSES_AFTER = 90 * DAY;
const MAX_EVENTS = 200;

export type Lock = number | "indefinite";

type CallerState = {
  strikes: number[]; // timestamps of strikes not yet answered by a lockout
  lockedUntil: Lock | null;
  lockouts: number;
  helpAlertAt?: number;
  abuseAlertAt?: number;
};

export type GuardEvent = {
  seq: number;
  at: number;
  kind: "lockout" | "help" | "abuse";
  tag: string; // anonymized key, see tagFor
  tier: string;
  categories: string[];
  until?: Lock;
};

type State = { seq: number; callers: Record<string, CallerState>; events: GuardEvent[] };

let state: State = fresh();
let loadedMtime = -1;
// Set when an unreadable file could not be moved aside: nothing is written over it until a person
// has looked (and restarted the server).
let frozen = false;

function fresh(): State {
  return { seq: 0, callers: {}, events: [] };
}

function parse(file: string): State {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as State;
  if (typeof parsed !== "object" || parsed === null || typeof parsed.callers !== "object") throw new Error("not guard state");
  return { seq: parsed.seq ?? 0, callers: parsed.callers ?? {}, events: parsed.events ?? [] };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function reload(): void {
  let mtime: number;
  try {
    mtime = statSync(FILE).mtimeMs;
  } catch (err) {
    // Only a missing file means "nothing flagged yet"; anything else keeps what we have.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      log.error("guard state not readable; keeping the in-memory copy", { error: errorText(err) });
    }
    return;
  }
  if (mtime === loadedMtime) return;
  try {
    state = parse(FILE);
    loadedMtime = mtime;
  } catch (err) {
    // Never let an unreadable file free every locked key, and never write over it: set it aside
    // for a person to look at, and fall back to the last good copy.
    const aside = `${FILE}.corrupt-${Date.now()}`;
    try {
      renameSync(FILE, aside);
    } catch (renameErr) {
      // Could not move it: leave it untouched, and keep what is in memory until a person looks.
      log.error("guard state unreadable and could not be set aside; not saving until restarted", { error: errorText(err), rename: errorText(renameErr) });
      loadedMtime = mtime;
      frozen = true;
      return;
    }
    loadedMtime = -1;
    try {
      state = parse(BACKUP);
      log.error("guard state unreadable; set aside and restored the backup", { aside, error: errorText(err) });
      save();
    } catch {
      log.error("guard state and backup unreadable; set aside, keeping the in-memory copy", { aside, error: errorText(err) });
    }
  }
}

function writeDurably(file: string, data: string): void {
  // Per process: guard-cli.ts and the server may write at the same moment.
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
}

function save(): boolean {
  if (frozen) {
    log.error("guard state not saved: the file on disk is unreadable and could not be set aside");
    return false;
  }
  try {
    const data = JSON.stringify(state);
    writeDurably(FILE, data);
    loadedMtime = statSync(FILE).mtimeMs;
    writeDurably(BACKUP, data);
    return true;
  } catch (err) {
    log.error("guard state not saved", { error: errorText(err) });
    return false;
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

function callerFor(key: string): CallerState {
  return (state.callers[key] ??= { strikes: [], lockedUntil: null, lockouts: 0 });
}

/** The lockout in force for this key, or null. */
export function activeLock(key: string, now = Date.now()): Lock | null {
  reload();
  const lock = state.callers[key]?.lockedUntil ?? null;
  return isActive(lock, now) ? lock : null;
}

/** Record a strike; returns the lockout in force afterwards, or null when there is none. */
export function recordStrike(key: string, tier: string, categories: string[], now = Date.now()): Lock | null {
  reload();
  const caller = callerFor(key);
  // A request that passed the lock check before another one locked the key changes nothing.
  if (isActive(caller.lockedUntil, now)) return caller.lockedUntil;
  const windowStart = now - DAY;
  caller.strikes = caller.strikes.filter((at) => at >= windowStart);
  const last = caller.strikes[caller.strikes.length - 1];
  if (last !== undefined && now - last < STRIKE_SPACING) return null;
  caller.strikes.push(now);
  if (caller.strikes.length < STRIKES_TO_LOCK) {
    save();
    return null;
  }
  const step = LADDER[caller.lockouts];
  const until: Lock = step === undefined ? "indefinite" : now + step;
  caller.lockedUntil = until;
  caller.lockouts += 1;
  caller.strikes = [];
  event({ at: now, kind: "lockout", tag: tagFor(key), tier, categories, until });
  save();
  log.info("guard lockout", { tag: tagFor(key), tier, categories, until });
  return until;
}

/** Alert once per key per day: self-harm ("help") or child sexual exploitation ("abuse"). */
export function recordAlert(kind: "help" | "abuse", key: string, tier: string, categories: string[], now = Date.now()): void {
  reload();
  const caller = callerFor(key);
  const field = kind === "help" ? "helpAlertAt" : "abuseAlertAt";
  const previous = caller[field];
  if (previous !== undefined && now - previous < DAY) return;
  caller[field] = now;
  event({ at: now, kind, tag: tagFor(key), tier, categories });
  save();
}

/**
 * A moderator called a lockout a false positive: end it now, take it off the ladder, clear strikes.
 * Matches by tag, since that is all an alert shows. Returns how many keys it lifted, or 0 when the
 * change could not be saved. Ending it (rather than clearing it) lets the ladder lapse as usual.
 */
export function liftByTag(tag: string, now = Date.now()): number {
  reload();
  let lifted = 0;
  for (const [key, caller] of Object.entries(state.callers)) {
    if (tagFor(key) !== tag) continue;
    caller.lockedUntil = now;
    caller.lockouts = Math.max(0, caller.lockouts - 1);
    caller.strikes = [];
    lifted += 1;
  }
  if (lifted === 0) return 0;
  return save() ? lifted : 0;
}

/**
 * Forget what no longer matters: keys with no live strikes, lockout or recent alert, and ladders
 * whose last timed lockout ended 90 days ago. An indefinite lockout is kept.
 */
export function pruneStrikes(now = Date.now()): void {
  reload();
  let changed = false;
  for (const [key, caller] of Object.entries(state.callers)) {
    const strikes = caller.strikes.filter((at) => at >= now - DAY);
    const recentAlert = [caller.helpAlertAt, caller.abuseAlertAt].some((at) => at !== undefined && now - at < DAY);
    const lapsed = typeof caller.lockedUntil === "number" && caller.lockedUntil < now - LADDER_LAPSES_AFTER;
    const idle = strikes.length === 0 && !isActive(caller.lockedUntil, now) && !recentAlert;
    if (idle && (caller.lockouts === 0 || lapsed)) {
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
  frozen = false;
}

export const GUARD_STATE_FILE = FILE;
