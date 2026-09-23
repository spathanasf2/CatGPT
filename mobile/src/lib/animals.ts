import { customById, customMeta, isCustomId, type CustomId } from "./custom-animals";
import type { Species } from "./avatars";

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

// A built-in character, or one the person made (custom-animals.ts).
export type AnimalRef = AnimalId | CustomId;

export type AnimalMeta = {
  id: AnimalRef;
  name: string;
  species: string;
  // Portrait (lib/avatars.ts): which species drawing, and which of its looks.
  kind: Species;
  look: string;
  emoji: string;
  accent: string;
  thinking: string;
  // Unlocked by membership (the server enforces this too -- server/src/animals.ts).
  membersOnly?: boolean;
  custom?: boolean;
};

export const ANIMALS: AnimalMeta[] = [
  { id: "hayley", name: "Hayley", species: "cat", kind: "cat", look: "gray-tabby", emoji: "\u{1F431}", accent: "#aab2d4", thinking: "following you around" },
  { id: "koba", name: "Koba", species: "dog", kind: "dog", look: "boxer", emoji: "\u{1F436}", accent: "#e0a94c", thinking: "hiding the toy" },
  { id: "dolores", name: "Dolores", species: "cow", kind: "cow", look: "holstein", emoji: "\u{1F42E}", accent: "#8bd6c9", thinking: "chewing on it" },
  { id: "gerald", name: "Gerald", species: "duck", kind: "duck", look: "mallard", emoji: "\u{1F986}", accent: "#f2d060", thinking: "drafting a complaint" },
  { id: "winston", name: "Winston", species: "parrot", kind: "parrot", look: "african-grey", emoji: "\u{1F99C}", accent: "#7fd858", thinking: "rehearsing the microwave" },
  { id: "kevin", name: "Kevin", species: "goldfish", kind: "fish", look: "goldfish", emoji: "\u{1F420}", accent: "#5eb3e0", thinking: "just staring" },
  { id: "mortimer", name: "Mortimer", species: "cat", kind: "cat", look: "orange-tabby", emoji: "\u{1F408}", accent: "#e07b54", thinking: "ignoring you", membersOnly: true },
  { id: "peanut", name: "Peanut", species: "chihuahua", kind: "dog", look: "chihuahua", emoji: "\u{1F415}", accent: "#c98bd8", thinking: "trembling", membersOnly: true },
  { id: "tank", name: "Tank", species: "horse", kind: "horse", look: "bay", emoji: "\u{1F434}", accent: "#a67c52", thinking: "eyeing your pockets", membersOnly: true },
  { id: "barbara", name: "Barbara", species: "goat", kind: "goat", look: "white", emoji: "\u{1F410}", accent: "#e08f9e", thinking: "chewing your sleeve", membersOnly: true },
  { id: "noodle", name: "Noodle", species: "snake", kind: "snake", look: "corn", emoji: "\u{1F40D}", accent: "#a3b85c", thinking: "tasting the air", membersOnly: true },
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

export function normalizeAnimalId(id: unknown): AnimalRef | null {
  if (typeof id !== "string") return null;
  if (ANIMALS.some((a) => a.id === id)) return id as AnimalId;
  if (isCustomId(id) && customById(id)) return id;
  return LEGACY_IDS[id] ?? null;
}

// Never throws: an id this build doesn't know (say, a character a newer build added, synced back
// somehow) falls back to the first animal rather than taking the whole chat view down.
export function animalById(id: AnimalRef): AnimalMeta {
  const custom = isCustomId(id) ? customById(id) : undefined;
  if (custom) return customMeta(custom);
  const canonical = normalizeAnimalId(id);
  return ANIMALS.find((a) => a.id === canonical) ?? ANIMALS[0]!;
}
