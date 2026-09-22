export type AnimalId = "cat" | "dog" | "cow" | "duck" | "parrot" | "fish" | "horse" | "goat" | "snake";

export type AnimalMeta = {
  id: AnimalId;
  label: string;
  emoji: string;
  accent: string;
  thinking: string;
  // Unlocked by membership (the server enforces this too -- server/src/animals.ts).
  membersOnly?: boolean;
};

export const ANIMALS: AnimalMeta[] = [
  { id: "cat", label: "Cat", emoji: "\u{1F431}", accent: "#c98bd8", thinking: "ignoring you" },
  { id: "dog", label: "Dog", emoji: "\u{1F436}", accent: "#e0a94c", thinking: "tail wagging" },
  { id: "cow", label: "Cow", emoji: "\u{1F42E}", accent: "#8bd6c9", thinking: "chewing on it" },
  { id: "duck", label: "Duck", emoji: "\u{1F986}", accent: "#f2d060", thinking: "waddling over" },
  { id: "parrot", label: "Parrot", emoji: "\u{1F99C}", accent: "#7fd858", thinking: "repeating something" },
  { id: "fish", label: "Fish", emoji: "\u{1F420}", accent: "#5eb3e0", thinking: "just staring" },
  { id: "horse", label: "Horse", emoji: "\u{1F434}", accent: "#c7794f", thinking: "eyeing your pockets", membersOnly: true },
  { id: "goat", label: "Goat", emoji: "\u{1F410}", accent: "#e08f9e", thinking: "chewing your sleeve", membersOnly: true },
  { id: "snake", label: "Snake", emoji: "\u{1F40D}", accent: "#a3b85c", thinking: "tasting the air", membersOnly: true },
];

export function animalById(id: AnimalId): AnimalMeta {
  const found = ANIMALS.find((a) => a.id === id);
  if (!found) throw new Error(`unknown animal: ${id}`);
  return found;
}
