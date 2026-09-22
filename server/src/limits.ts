export type Limits = { weekly: number; monthly: number };
export type Tier = "free" | "member";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number`);
  return n;
}

// Frank's rule (2026-09-22): charge X a month, allow X/2 of API spend per month and X/8 per week.
// Apple's cut (15% small-business / 30% standard) isn't in the rule; at the cap a member still nets
// positive either way. Price is the one knob -- change it here (env) whenever the App Store Connect
// price changes, and the caps follow.
const MEMBER_PRICE_USD = envNumber("MEMBER_PRICE_USD", 0.99);
// Blended $ per 1M tokens for this app's actual usage shape: ~780 prompt / ~45 completion tokens
// per message with the full history window, at gemini-2.5-flash-lite's $0.10/$0.40 per M (the
// fallback models cost the same or less). Recompute if the model or prompt length changes much.
const COST_PER_MTOK_USD = envNumber("COST_PER_MTOK_USD", 0.12);
// Free installs get this fraction of a member's allowance.
const FREE_FRACTION = envNumber("FREE_FRACTION", 0.1);
// A free-tier IP (not install) gets this many members' worth. It only exists to stop one machine
// minting fresh install IDs forever; it's generous so households and carrier NAT don't trip it.
const IP_BACKSTOP_MEMBERS = 2;

const tokensFor = (usd: number) => Math.round((usd / COST_PER_MTOK_USD) * 1_000_000);

export const MEMBER_LIMITS: Limits = {
  monthly: tokensFor(MEMBER_PRICE_USD / 2),
  weekly: tokensFor(MEMBER_PRICE_USD / 8),
};

export const FREE_LIMITS: Limits = {
  monthly: Math.round(MEMBER_LIMITS.monthly * FREE_FRACTION),
  weekly: Math.round(MEMBER_LIMITS.weekly * FREE_FRACTION),
};

export const IP_BACKSTOP_LIMITS: Limits = {
  monthly: MEMBER_LIMITS.monthly * IP_BACKSTOP_MEMBERS,
  weekly: MEMBER_LIMITS.weekly * IP_BACKSTOP_MEMBERS,
};

export const LIMITS_SUMMARY = { memberPriceUsd: MEMBER_PRICE_USD, costPerMTokUsd: COST_PER_MTOK_USD, MEMBER_LIMITS, FREE_LIMITS, IP_BACKSTOP_LIMITS };
