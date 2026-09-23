import type { AnimalMeta } from "./animals";
import { defaultLook, type Species } from "./avatars";
import { randomHex } from "./ids";

// Animals people make (members). Stored on the device, like chats; every request to one carries
// its full spec, and the server writes the prompt from it (server/src/custom.ts) -- so the ids,
// quirks and name rule here must match that file.
export type SpeciesId = Species;
export type Level = -2 | -1 | 0 | 1 | 2;
export type CustomId = `custom-${string}`;
export type SliderKey = "energy" | "friendliness" | "appetite" | "drama";

export type CustomAnimal = {
  id: CustomId;
  name: string;
  species: SpeciesId;
  pronoun: "she" | "he" | "it";
  quirks: string[];
  // Portrait look (lib/avatars.ts LOOKS[species]); also the noun the server uses ("golden retriever").
  // Absent on animals made in builds 1.0 (13)-(14): they get their species' first look.
  look?: string;
  accent: string;
  createdAt: number;
  // Soft delete: chats that talked to it still need its name and emoji to render.
  deleted?: boolean;
} & Record<SliderKey, Level>;

export const SPECIES_OPTIONS: { id: SpeciesId; label: string; emoji: string }[] = [
  { id: "cat", label: "Cat", emoji: "\u{1F408}" },
  { id: "dog", label: "Dog", emoji: "\u{1F415}" },
  { id: "cow", label: "Cow", emoji: "\u{1F404}" },
  { id: "duck", label: "Duck", emoji: "\u{1F986}" },
  { id: "parrot", label: "Parrot", emoji: "\u{1F99C}" },
  { id: "fish", label: "Fish", emoji: "\u{1F41F}" },
  { id: "horse", label: "Horse", emoji: "\u{1F40E}" },
  { id: "goat", label: "Goat", emoji: "\u{1F410}" },
  { id: "snake", label: "Snake", emoji: "\u{1F40D}" },
];

// What each slider step reads as in the editor, from -2 to +2.
export const SLIDERS: { key: SliderKey; label: string; steps: [string, string, string, string, string] }[] = [
  { key: "energy", label: "Energy", steps: ["couch potato", "laid-back", "normal", "lively", "bouncing off walls"] },
  { key: "friendliness", label: "Friendliness", steps: ["hostile", "aloof", "normal", "friendly", "clingy"] },
  { key: "appetite", label: "Appetite", steps: ["picky", "not fussed", "normal", "always hungry", "bottomless"] },
  { key: "drama", label: "Drama", steps: ["unflappable", "calm", "normal", "reactive", "theatrical"] },
];

export const QUIRKS: { id: string; label: string }[] = [
  { id: "thief", label: "steals things" },
  { id: "vacuum", label: "afraid of the vacuum" },
  { id: "singer", label: "sings along" },
  { id: "judge", label: "judges you" },
  { id: "counter", label: "counter surfer" },
  { id: "napper", label: "naps anywhere" },
  { id: "escape", label: "escape artist" },
  { id: "jealous", label: "jealous of your phone" },
  { id: "dawn", label: "5am alarm clock" },
  { id: "socks", label: "hoards socks" },
];
export const MAX_QUIRKS = 2;
export const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} '.-]{0,19}$/u;

const ACCENTS = ["#f4a261", "#9ad1d4", "#e9c46a", "#b5a1e0", "#f28482", "#84a59d", "#f6bd60", "#90be6d"];
const KEY = "aineko.customAnimals.v1";
let cache: CustomAnimal[] | null = null;

export function isCustomId(id: unknown): id is CustomId {
  return typeof id === "string" && /^custom-[a-f0-9]{16}$/.test(id);
}

export function newCustomId(): CustomId {
  return `custom-${randomHex(8)}`;
}

export function pickAccent(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ACCENTS[h % ACCENTS.length]!;
}

export function loadCustomAnimals(): CustomAnimal[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed.filter((a) => isCustomId(a?.id)) : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function store(list: CustomAnimal[]): void {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // best-effort, like chats
  }
}

export function saveCustomAnimal(animal: CustomAnimal): void {
  const list = loadCustomAnimals();
  store(list.some((a) => a.id === animal.id) ? list.map((a) => (a.id === animal.id ? animal : a)) : [...list, animal]);
}

export function deleteCustomAnimal(id: CustomId): void {
  store(loadCustomAnimals().map((a) => (a.id === id ? { ...a, deleted: true } : a)));
}

export function customById(id: string): CustomAnimal | undefined {
  return loadCustomAnimals().find((a) => a.id === id);
}

export function speciesOption(id: SpeciesId) {
  return SPECIES_OPTIONS.find((s) => s.id === id) ?? SPECIES_OPTIONS[0]!;
}

export function customMeta(a: CustomAnimal): AnimalMeta {
  const s = speciesOption(a.species);
  return {
    id: a.id,
    name: a.name,
    species: a.species,
    kind: a.species,
    look: a.look ?? defaultLook(a.species),
    emoji: s.emoji,
    accent: a.accent,
    thinking: "thinking it over",
    membersOnly: true,
    custom: true,
  };
}

// Exactly what POST /chat's `custom` field expects (server/src/custom.ts parseCustom).
export function customSpec(a: CustomAnimal) {
  const { id, name, species, pronoun, quirks, energy, friendliness, appetite, drama, look } = a;
  return { id, name, species, pronoun, quirks, energy, friendliness, appetite, drama, ...(look ? { look } : {}) };
}
