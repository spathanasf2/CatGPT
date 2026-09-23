import type { Animal, SpeciesId } from "./animals.js";

// Custom animals (2026-09-23, members): the person picks species, name, pronoun, four sliders and up
// to two quirks; the server writes every word of the prompt from those choices. No free-form text
// reaches the model except the validated name -- free-form personas would turn the app into a
// general-purpose AI on our bill and undo the kid-safe posture.

type Species = { vocabulary: string[]; triggers: string[]; mimics?: true };

// Species defaults for custom animals (the built-in characters carry their own).
export const SPECIES: Record<SpeciesId, Species> = {
  cat: { vocabulary: ["Meow", "Mrow", "Mrrp", "Purr", "Hiss", "Chirp", "Mew"], triggers: ["dinner", "treat", "vet", "bath", "outside", "mouse", "bird", "no"] },
  dog: { vocabulary: ["Woof", "Bark", "Arf", "Yip", "Whine", "Growl", "Awoo", "Ruff"], triggers: ["walk", "treat", "ball", "park", "good boy", "good girl", "dinner", "squirrel", "vet", "bath", "no"] },
  cow: { vocabulary: ["Moo", "Mooo", "Mmmoo", "MOOOOO"], triggers: ["grass", "hay", "fence", "barn", "rain"] },
  duck: { vocabulary: ["Quack", "QUACK", "Quack quack", "Wak"], triggers: ["bread", "pond", "water", "rain", "goose"] },
  parrot: { vocabulary: ["Squawk", "SQUAWK", "Awk", "Rawk"], triggers: [], mimics: true },
  fish: { vocabulary: ["Blub", "blub blub", "...", "*bubble*"], triggers: ["food", "flakes", "tap"] },
  horse: { vocabulary: ["Neigh", "Whinny", "Snort", "Pfffrrrt"], triggers: ["carrot", "apple", "ride", "saddle", "treat", "grass"] },
  goat: { vocabulary: ["Meh", "MEHHH", "Baa", "BAAAAAH"], triggers: ["food", "eat", "paper", "hat", "climb"] },
  snake: { vocabulary: ["Hsss", "Sssss", "HSSSSSS", "*flick flick*"], triggers: ["mouse", "warm", "heat", "sun", "egg"] },
};

// The look someone picked for their animal (the portrait in mobile/src/lib/avatars.ts -- keep the ids
// in sync), as the noun the prompt uses: a custom golden should know it's a golden retriever.
export const LOOK_NOUNS: Record<SpeciesId, Record<string, string>> = {
  cat: { "gray-tabby": "gray tabby cat", "orange-tabby": "orange tabby cat", black: "black cat", tuxedo: "tuxedo cat", calico: "calico cat" },
  dog: { boxer: "boxer", golden: "golden retriever", lab: "black Labrador", chihuahua: "chihuahua", mutt: "mutt" },
  cow: { holstein: "Holstein cow", jersey: "Jersey cow", highland: "Highland cow" },
  duck: { mallard: "mallard duck", white: "white duck", brown: "brown duck" },
  parrot: { "african-grey": "African grey parrot", macaw: "scarlet macaw", cockatiel: "cockatiel" },
  fish: { goldfish: "goldfish", tang: "blue tang", betta: "betta fish" },
  horse: { bay: "bay horse", chestnut: "chestnut horse", gray: "dapple gray horse", palomino: "palomino horse", black: "black horse" },
  goat: { white: "white goat", brown: "brown goat", blackwhite: "black-and-white goat" },
  snake: { corn: "corn snake", green: "green snake", black: "black snake", striped: "garter snake" },
};

type Level = -2 | -1 | 0 | 1 | 2;
const SLIDERS = ["energy", "friendliness", "appetite", "drama"] as const;
type Slider = (typeof SLIDERS)[number];

// Written as fragments without pronouns, like the built-in personalities. 0 = say nothing.
const SLIDER_TEXT: Record<Slider, Record<Exclude<Level, 0>, string>> = {
  energy: {
    [-2]: "Profoundly lazy: every movement is a negotiation, usually lost.",
    [-1]: "Laid-back; moves only when it's clearly worth it.",
    1: "Lively, and always up for something.",
    2: "Vibrating with energy -- cannot sit still, and everything is an emergency.",
  },
  friendliness: {
    [-2]: "Openly hostile to everyone, the human included, and tolerates them at best.",
    [-1]: "Aloof and suspicious; affection has to be earned, slowly.",
    1: "Friendly, and always glad to see the human.",
    2: "Devoted to the point of clinginess -- the human is the center of the universe.",
  },
  appetite: {
    [-2]: "Picky beyond reason; rejects most food on principle.",
    [-1]: "Not especially food-motivated.",
    1: "Always a little bit hungry.",
    2: "Every thought, eventually, becomes a thought about food.",
  },
  drama: {
    [-2]: "Unflappable to the point of seeming asleep.",
    [-1]: "Calm; reacts in small, understated ways.",
    1: "Reacts big to most things.",
    2: "Treats the smallest thing as a full theatrical production: gasps, swoons, collapses, outrage.",
  },
};

// Only the extremes earn an adjective in the one-line description ("a hyper, clingy dog").
const SLIDER_ADJECTIVE: Record<Slider, { low: string; high: string }> = {
  energy: { low: "lazy", high: "hyper" },
  friendliness: { low: "grumpy", high: "clingy" },
  appetite: { low: "picky", high: "ravenous" },
  drama: { low: "unflappable", high: "dramatic" },
};

// Keep ids in sync with QUIRKS in mobile/src/lib/custom-animals.ts (which holds the labels).
export const QUIRKS: Record<string, string> = {
  thief: "Steals small objects and hides them somewhere only it knows.",
  vacuum: "Mortally afraid of the vacuum cleaner.",
  singer: "Joins in, loudly, with any music or singing.",
  judge: "Silently judges every decision the human makes.",
  counter: "Forever trying to get onto the kitchen counter.",
  napper: "Can fall asleep anywhere, in the middle of anything.",
  escape: "Always plotting an escape.",
  jealous: "Jealous of phones, laptops, and anything else that gets attention.",
  dawn: "Wakes the whole household at dawn, every single day.",
  socks: "Hoards socks.",
};
export const MAX_QUIRKS = 2;

export type CustomSpec = {
  id: string;
  name: string;
  species: SpeciesId;
  pronoun: "she" | "he" | "it";
  quirks: string[];
  // Optional: builds 1.0 (13)-(14) don't send one; unknown looks are ignored rather than rejected.
  look?: string;
} & Record<Slider, Level>;

export const CUSTOM_ID = /^custom-[a-f0-9]{16}$/;
// Letters/digits first, then letters, digits, spaces, apostrophes, periods, hyphens -- 20 max. The
// only user text that reaches the prompt, so it's kept to something that can only be a name.
export const CUSTOM_NAME = /^[\p{L}\p{N}][\p{L}\p{N} '.-]{0,19}$/u;

const isLevel = (v: unknown): v is Level => v === -2 || v === -1 || v === 0 || v === 1 || v === 2;

export function parseCustom(raw: unknown): CustomSpec | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !CUSTOM_ID.test(r.id)) return null;
  if (typeof r.name !== "string" || !CUSTOM_NAME.test(r.name.trim())) return null;
  if (typeof r.species !== "string" || !Object.prototype.hasOwnProperty.call(SPECIES, r.species)) return null;
  if (r.pronoun !== "she" && r.pronoun !== "he" && r.pronoun !== "it") return null;
  if (!SLIDERS.every((s) => isLevel(r[s]))) return null;
  const quirks = r.quirks ?? [];
  if (!Array.isArray(quirks) || quirks.length > MAX_QUIRKS) return null;
  if (!quirks.every((q) => typeof q === "string" && Object.prototype.hasOwnProperty.call(QUIRKS, q))) return null;
  const species = r.species as SpeciesId;
  const look = typeof r.look === "string" && Object.prototype.hasOwnProperty.call(LOOK_NOUNS[species], r.look) ? r.look : undefined;
  return {
    id: r.id,
    name: r.name.trim(),
    species,
    ...(look ? { look } : {}),
    pronoun: r.pronoun,
    quirks: [...new Set(quirks as string[])],
    energy: r.energy as Level,
    friendliness: r.friendliness as Level,
    appetite: r.appetite as Level,
    drama: r.drama as Level,
  };
}

export function customAnimal(spec: CustomSpec): Animal {
  const species = SPECIES[spec.species];
  const traits = SLIDERS.flatMap((s) => (spec[s] === 0 ? [] : [SLIDER_TEXT[s][spec[s] as Exclude<Level, 0>]]));
  const quirks = spec.quirks.map((q) => QUIRKS[q]!);
  const adjectives = SLIDERS.flatMap((s) =>
    spec[s] === -2 ? [SLIDER_ADJECTIVE[s].low] : spec[s] === 2 ? [SLIDER_ADJECTIVE[s].high] : [],
  );
  const personality = [...traits, ...quirks].join(" ") || `A thoroughly ordinary ${spec.species} in every respect.`;
  const [first, second] = adjectives;
  const noun = (spec.look && LOOK_NOUNS[spec.species][spec.look]) || spec.species;
  const phrase = second ? `${first}, ${second} ${noun}` : first ? `${first} ${noun}` : noun;
  return {
    id: spec.id,
    name: spec.name,
    species: spec.species,
    description: `${/^[aeiou]/i.test(phrase) ? "an" : "a"} ${phrase}`,
    pronoun: spec.pronoun,
    personality,
    vocabulary: species.vocabulary,
    triggers: species.triggers,
    remembers: `Remembers what a ${spec.species} like this would: food, fun, frights, and who was kind or unkind.`,
    ...(species.mimics ? { mimics: true as const } : {}),
    membersOnly: true,
  };
}
