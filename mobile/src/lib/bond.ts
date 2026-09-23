import type { AnimalRef } from "./animals";

// How each animal feels about this person (-10..10), kept on the device like memory. The server
// does the arithmetic (server/src/bond.ts) and hands back the new score after every reply; the app
// only stores it, sends it back, and notices when it crosses into a new level.
const KEY = "aineko.bonds.v1";

export type BondLevel = "hostile" | "wary" | "undecided" | "fond" | "devoted";
const ORDER: BondLevel[] = ["hostile", "wary", "undecided", "fond", "devoted"];

// Same thresholds as the server.
export function bondLevel(score: number): BondLevel {
  if (score <= -6) return "hostile";
  if (score <= -2) return "wary";
  if (score <= 1) return "undecided";
  if (score <= 5) return "fond";
  return "devoted";
}

export const LEVEL_LABEL: Record<BondLevel, string> = {
  hostile: "can't stand you",
  wary: "wary of you",
  undecided: "making up their mind",
  fond: "fond of you",
  devoted: "devoted to you",
};

function load(): Partial<Record<AnimalRef, number>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function save(bonds: Partial<Record<AnimalRef, number>>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(bonds));
  } catch {
    // best-effort, like memories
  }
}

/** The stored score, or null if they've never talked (the server then uses the character's start). */
export function bondFor(animal: AnimalRef): number | null {
  const v = load()[animal];
  return typeof v === "number" ? v : null;
}

export function allBonds(): Partial<Record<AnimalRef, number>> {
  return load();
}

export function setBond(animal: AnimalRef, score: number): void {
  save({ ...load(), [animal]: score });
}

export function forgetBonds(animal?: AnimalRef): void {
  if (!animal) return save({});
  const bonds = load();
  delete bonds[animal];
  save(bonds);
}

// The note under a reply when a feeling crosses into a new level. Null when nothing changed.
export function bondNote(name: string, before: number | null, after: number): { text: string; warmer: boolean } | null {
  if (before === null) return null;
  const from = bondLevel(before);
  const to = bondLevel(after);
  if (from === to) return null;
  const warmer = ORDER.indexOf(to) > ORDER.indexOf(from);
  const rising: Record<BondLevel, string> = {
    hostile: "",
    wary: "is a little less annoyed with you",
    undecided: "is coming around to you",
    fond: "is warming up to you",
    devoted: "adores you now",
  };
  const falling: Record<BondLevel, string> = {
    devoted: "",
    fond: "is a little hurt",
    undecided: "is cooling on you",
    wary: "is getting wary of you",
    hostile: "has had it with you",
  };
  return { text: `${name} ${(warmer ? rising : falling)[to]}`, warmer };
}
