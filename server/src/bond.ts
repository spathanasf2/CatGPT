import type { Animal } from "./animals.js";

// Relationship arcs (2026-09-23). Each character has a feeling score toward the person, -10..10,
// kept on the device like memory: the app sends the current score (or null for "never met"), the
// model says how this exchange moved it (-2..2, judged in character -- Mortimer thaws agonizingly
// slowly, Koba forgives instantly), and the server does the arithmetic and hands back the new score.

export const BOND_MIN = -10;
export const BOND_MAX = 10;

// Five levels; the app shows a note when one is crossed ("Mortimer is warming up to you").
export function bondLevel(score: number): "hostile" | "wary" | "undecided" | "fond" | "devoted" {
  if (score <= -6) return "hostile";
  if (score <= -2) return "wary";
  if (score <= 1) return "undecided";
  if (score <= 5) return "fond";
  return "devoted";
}

const LEVEL_WORDS: Record<ReturnType<typeof bondLevel>, string> = {
  hostile: "can't stand the human",
  wary: "is wary of the human",
  undecided: "hasn't made up their mind about the human",
  fond: "is fond of the human",
  devoted: "is devoted to the human",
};

export function describeBond(score: number): string {
  return `${LEVEL_WORDS[bondLevel(score)]} (${score} on a -10 to 10 scale)`;
}

/** undefined = the app predates bonds; null = first meeting (use the character's start). */
export function parseBond(raw: unknown): number | null | undefined | "invalid" {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < BOND_MIN || raw > BOND_MAX) return "invalid";
  return raw;
}

export function currentBond(animal: Animal, sent: number | null): number | null {
  if (!animal.bond) return null;
  return sent ?? animal.bond.start;
}

export function applyBondDelta(score: number, delta: unknown): number {
  const d = typeof delta === "number" && Number.isFinite(delta) ? Math.max(-2, Math.min(2, Math.round(delta))) : 0;
  return Math.max(BOND_MIN, Math.min(BOND_MAX, score + d));
}
