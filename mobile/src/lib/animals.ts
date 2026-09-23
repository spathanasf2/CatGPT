// Characters, not species (2026-09-23) -- see server/src/animals.ts for the personalities. Keep ids,
// order, and membersOnly in sync with the server; this file only holds what the UI draws.
export type AnimalId =
  | "hayley"
  | "koba"
  | "dolores"
  | "gerald"
  | "winston"
  | "kevin"
  | "mortimer"
  | "peanut"
  | "tank"
  | "barbara"
  | "noodle";

export type AnimalMeta = {
  id: AnimalId;
  name: string;
  species: string;
  emoji: string;
  accent: string;
  thinking: string;
  // Unlocked by membership (the server enforces this too -- server/src/animals.ts).
  membersOnly?: boolean;
};

export const ANIMALS: AnimalMeta[] = [
  { id: "hayley", name: "Hayley", species: "cat", emoji: "\u{1F431}", accent: "#aab2d4", thinking: "following you around" },
  { id: "koba", name: "Koba", species: "dog", emoji: "\u{1F436}", accent: "#e0a94c", thinking: "hiding the toy" },
  { id: "dolores", name: "Dolores", species: "cow", emoji: "\u{1F42E}", accent: "#8bd6c9", thinking: "chewing on it" },
  { id: "gerald", name: "Gerald", species: "duck", emoji: "\u{1F986}", accent: "#f2d060", thinking: "drafting a complaint" },
  { id: "winston", name: "Winston", species: "parrot", emoji: "\u{1F99C}", accent: "#7fd858", thinking: "rehearsing the microwave" },
  { id: "kevin", name: "Kevin", species: "goldfish", emoji: "\u{1F420}", accent: "#5eb3e0", thinking: "just staring" },
  { id: "mortimer", name: "Mortimer", species: "cat", emoji: "\u{1F408}", accent: "#e07b54", thinking: "ignoring you", membersOnly: true },
  { id: "peanut", name: "Peanut", species: "chihuahua", emoji: "\u{1F415}", accent: "#c98bd8", thinking: "trembling", membersOnly: true },
  { id: "tank", name: "Tank", species: "horse", emoji: "\u{1F434}", accent: "#a67c52", thinking: "eyeing your pockets", membersOnly: true },
  { id: "barbara", name: "Barbara", species: "goat", emoji: "\u{1F410}", accent: "#e08f9e", thinking: "chewing your sleeve", membersOnly: true },
  { id: "noodle", name: "Noodle", species: "snake", emoji: "\u{1F40D}", accent: "#a3b85c", thinking: "tasting the air", membersOnly: true },
];

// Chats saved by builds 1.0 (1)-(12) name animals by species. Each maps to that species' default
// character, same as the server does.
const LEGACY_IDS: Record<string, AnimalId> = {
  cat: "hayley",
  dog: "koba",
  cow: "dolores",
  duck: "gerald",
  parrot: "winston",
  fish: "kevin",
  horse: "tank",
  goat: "barbara",
  snake: "noodle",
};

export function normalizeAnimalId(id: unknown): AnimalId | null {
  if (typeof id !== "string") return null;
  if (ANIMALS.some((a) => a.id === id)) return id as AnimalId;
  return LEGACY_IDS[id] ?? null;
}

// Never throws: an id this build doesn't know (say, a character a newer build added, synced back
// somehow) falls back to the first animal rather than taking the whole chat view down.
export function animalById(id: AnimalId): AnimalMeta {
  const canonical = normalizeAnimalId(id);
  return ANIMALS.find((a) => a.id === canonical) ?? ANIMALS[0]!;
}
