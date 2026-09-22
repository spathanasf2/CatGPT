export type AnimalId = "cat" | "dog" | "cow" | "duck" | "parrot" | "fish";

export type AnimalMeta = {
  id: AnimalId;
  label: string;
  emoji: string;
  accent: string;
  thinking: string;
};

export const ANIMALS: AnimalMeta[] = [
  { id: "cat", label: "Cat", emoji: "\u{1F431}", accent: "#c98bd8", thinking: "ignoring you" },
  { id: "dog", label: "Dog", emoji: "\u{1F436}", accent: "#e0a94c", thinking: "tail wagging" },
  { id: "cow", label: "Cow", emoji: "\u{1F42E}", accent: "#8bd6c9", thinking: "chewing on it" },
  { id: "duck", label: "Duck", emoji: "\u{1F986}", accent: "#f2d060", thinking: "waddling over" },
  { id: "parrot", label: "Parrot", emoji: "\u{1F99C}", accent: "#7fd858", thinking: "repeating something" },
  { id: "fish", label: "Fish", emoji: "\u{1F420}", accent: "#5eb3e0", thinking: "just staring" },
];

export function animalById(id: AnimalId): AnimalMeta {
  const found = ANIMALS.find((a) => a.id === id);
  if (!found) throw new Error(`unknown animal: ${id}`);
  return found;
}
