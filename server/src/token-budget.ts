import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { log } from "./log.js";

type WindowState = { tokens: number; resetAt: number };
type IpRecord = { week: WindowState; month: WindowState };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// Same persistence pattern as usage.ts -- lives beside package.json unless overridden to point
// at a mounted volume (Docker deployments), so quotas survive restarts instead of giving every
// IP a free reset.
const FILE = process.env.TOKEN_BUDGET_FILE || fileURLToPath(new URL("../token-budget.json", import.meta.url));

function load(): Record<string, IpRecord> {
  if (existsSync(FILE)) {
    try {
      return JSON.parse(readFileSync(FILE, "utf8")) as Record<string, IpRecord>;
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
    writeFileSync(FILE, JSON.stringify(records));
  } catch (err) {
    log.error("failed to persist token budget", { error: err instanceof Error ? err.message : String(err) });
  }
}

// Periodic flush (not on every write -- this gets called on every chat reply) plus cleanup of
// IPs that haven't been seen in over a month, so the file doesn't grow forever.
setInterval(() => {
  if (dirty) {
    persist();
    dirty = false;
  }
  const now = Date.now();
  for (const [ip, rec] of Object.entries(records)) {
    if (now > rec.month.resetAt) delete records[ip];
  }
}, 60_000).unref();

function getOrInit(ip: string): IpRecord {
  const now = Date.now();
  let rec = records[ip];
  if (!rec) {
    rec = { week: { tokens: 0, resetAt: now + WEEK_MS }, month: { tokens: 0, resetAt: now + MONTH_MS } };
    records[ip] = rec;
  }
  if (now > rec.week.resetAt) rec.week = { tokens: 0, resetAt: now + WEEK_MS };
  if (now > rec.month.resetAt) rec.month = { tokens: 0, resetAt: now + MONTH_MS };
  return rec;
}

export type BudgetCheck = { allowed: true } | { allowed: false; reason: string };

/**
 * Checks whether an IP has already exhausted its weekly or monthly allowance -- this gates
 * whether a NEW request is honored, it doesn't (and can't) know that request's own token cost in
 * advance. Actual usage can therefore overshoot the limit by up to one request's worth, same as
 * how OpenAI/Anthropic's own quota systems behave.
 */
export function checkBudget(ip: string, weeklyLimit: number, monthlyLimit: number): BudgetCheck {
  const rec = getOrInit(ip);
  if (rec.month.tokens >= monthlyLimit) {
    return { allowed: false, reason: `monthly usage limit reached, resets ${new Date(rec.month.resetAt).toISOString().slice(0, 10)}` };
  }
  if (rec.week.tokens >= weeklyLimit) {
    return { allowed: false, reason: `weekly usage limit reached, resets ${new Date(rec.week.resetAt).toISOString().slice(0, 10)}` };
  }
  return { allowed: true };
}

export function recordTokens(ip: string, tokens: number): void {
  const rec = getOrInit(ip);
  rec.week.tokens += tokens;
  rec.month.tokens += tokens;
  dirty = true;
}
