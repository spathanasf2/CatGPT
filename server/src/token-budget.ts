import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./atomic-write.js";
import type { Limits } from "./limits.js";
import { log } from "./log.js";

type WindowState = { tokens: number; resetAt: number };
// Keyed by who's being metered: "member:<originalTransactionId>", "install:<id>", or "ip:<addr>"
// (see index.ts). Bare-IP keys written before 2026-09-22 are left to age out.
type BudgetRecord = { week: WindowState; month: WindowState };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// Same persistence pattern as usage.ts -- lives beside package.json unless overridden to point
// at a mounted volume (Docker deployments), so quotas survive restarts instead of giving every
// IP a free reset.
const FILE = process.env.TOKEN_BUDGET_FILE || fileURLToPath(new URL("../token-budget.json", import.meta.url));

function load(): Record<string, BudgetRecord> {
  if (existsSync(FILE)) {
    try {
      return JSON.parse(readFileSync(FILE, "utf8")) as Record<string, BudgetRecord>;
    } catch {
      log.warn("token-budget.json unreadable, starting fresh");
    }
  }
  return {};
}

const records = load();
let dirty = false;

function persist(): void {
  try {
    writeFileAtomic(FILE, JSON.stringify(records));
  } catch (err) {
    log.error("failed to persist token budget", { error: err instanceof Error ? err.message : String(err) });
  }
}

// Also called on shutdown (index.ts), so a redeploy doesn't drop up to a minute of spend.
export function flushBudget(): void {
  if (!dirty) return;
  persist();
  dirty = false;
}

// Periodic flush (not on every write -- this gets called on every chat reply) plus cleanup of
// keys that haven't been seen in over a month, so the file doesn't grow forever.
setInterval(() => {
  flushBudget();
  const now = Date.now();
  for (const [key, rec] of Object.entries(records)) {
    if (now > rec.month.resetAt) delete records[key];
  }
}, 60_000).unref();

function getOrInit(key: string): BudgetRecord {
  const now = Date.now();
  let rec = records[key];
  if (!rec) {
    rec = { week: { tokens: 0, resetAt: now + WEEK_MS }, month: { tokens: 0, resetAt: now + MONTH_MS } };
    records[key] = rec;
  }
  if (now > rec.week.resetAt) rec.week = { tokens: 0, resetAt: now + WEEK_MS };
  if (now > rec.month.resetAt) rec.month = { tokens: 0, resetAt: now + MONTH_MS };
  return rec;
}

export type BudgetCheck =
  | { allowed: true }
  | { allowed: false; window: "weekly" | "monthly"; resetAt: number; reason: string };

/**
 * Checks whether a key has already exhausted its weekly or monthly allowance -- this gates
 * whether a NEW request is honored, it doesn't (and can't) know that request's own token cost in
 * advance. Actual usage can therefore overshoot the limit by up to one request's worth (bounded by
 * max_tokens in openrouter.ts), same as how OpenAI/Anthropic's own quota systems behave.
 */
export function checkBudget(key: string, limits: Limits): BudgetCheck {
  const rec = getOrInit(key);
  // The reason text is what builds 1.0 (1)-(9) display verbatim; newer builds use window/resetAt.
  if (rec.month.tokens >= limits.monthly) {
    const resetAt = rec.month.resetAt;
    return { allowed: false, window: "monthly", resetAt, reason: `monthly usage limit reached, resets ${new Date(resetAt).toISOString().slice(0, 10)}` };
  }
  if (rec.week.tokens >= limits.weekly) {
    const resetAt = rec.week.resetAt;
    return { allowed: false, window: "weekly", resetAt, reason: `weekly usage limit reached, resets ${new Date(resetAt).toISOString().slice(0, 10)}` };
  }
  return { allowed: true };
}

export function recordTokens(keys: string[], tokens: number): void {
  for (const key of keys) {
    const rec = getOrInit(key);
    rec.week.tokens += tokens;
    rec.month.tokens += tokens;
  }
  dirty = true;
}

export type WindowUsage = { used: number; limit: number; resetAt: number | null };

// Read-only view for GET /usage/me -- doesn't start a window for someone who hasn't chatted yet.
export function peekBudget(key: string, limits: Limits): { week: WindowUsage; month: WindowUsage } {
  const now = Date.now();
  const rec = records[key];
  const view = (w: WindowState | undefined, limit: number): WindowUsage =>
    w && now <= w.resetAt ? { used: w.tokens, limit, resetAt: w.resetAt } : { used: 0, limit, resetAt: null };
  return { week: view(rec?.week, limits.weekly), month: view(rec?.month, limits.monthly) };
}
