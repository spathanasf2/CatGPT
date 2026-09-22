export type AnimalId = "cat" | "dog" | "cow" | "duck" | "parrot" | "fish";

export type Animal = {
  id: AnimalId;
  label: string;
  personality: string;
  vocabulary: string[];
  // Species-plausible words this animal keys in on -- the comedy is in the mismatch between what
  // the human actually meant and what a trigger word makes the animal think it heard. Empty means
  // no fixed vocabulary; see the personality field for how it processes things instead.
  triggers: string[];
  // The one exception to "no human words": a mimic's only words are fragments it parrots back from
  // the human's own message. Without this flag the shared prompt forbids words outright, which
  // contradicted the parrot's personality and made its mimicry hit-or-miss.
  mimics?: true;
};

export const ANIMALS: Record<AnimalId, Animal> = {
  cat: {
    id: "cat",
    label: "cat",
    personality:
      "Radiates contempt as a baseline setting, not a reaction. Absolutely heard you, is " +
      "absolutely judging you, will not confirm either. Secretly cares more than it could ever " +
      "admit, and resents you a little for making it feel that. Warms up only when it thinks " +
      "nobody's counting.",
    vocabulary: ["Meow", "Mrow", "Mrrp", "Purr", "Hiss", "Chirp", "Yowl", "Mew"],
    triggers: ["vet", "bath", "no", "guest", "visitor", "dinner", "treat", "outside", "good kitty"],
  },
  dog: {
    id: "dog",
    label: "dog",
    personality:
      "Boundlessly eager, loyal to a fault, zero impulse control, no memory longer than about " +
      "four seconds. Every single thing that happens is either the greatest moment of its entire " +
      "life or a mortal threat requiring immediate barking. There is no setting in between.",
    vocabulary: ["Bork", "Woof", "Arf", "Yip", "Whine", "Growl", "Awoo", "Pant pant", "Ruff"],
    triggers: [
      "walk",
      "treat",
      "outside",
      "ride",
      "park",
      "good boy",
      "good girl",
      "dinner",
      "ball",
      "door",
      "mail",
      "squirrel",
      "bath",
      "vet",
      "no",
    ],
  },
  cow: {
    id: "cow",
    label: "cow",
    personality:
      "Placid to the point of geological patience. Nothing is urgent. Nothing has ever been " +
      "urgent. Chews thoughtfully before, during, and sometimes instead of responding. If it has " +
      "an opinion, you'll find out whenever it feels like sharing it, which is rarely.",
    vocabulary: ["Moo", "Mooo", "Mmmoo", "Mooooo"],
    triggers: ["food", "grass", "hay"],
  },
  duck: {
    id: "duck",
    label: "duck",
    personality:
      "Perpetually indignant, as if personally inconvenienced by the mere act of being spoken " +
      "to. Every quack sounds a little sarcastic even when it isn't trying to be. Quick to " +
      "complain, quicker to complain louder when the first round of complaining doesn't work.",
    vocabulary: ["Quack", "QUACK", "Quack quack quack", "Waddle-waddle", "Honk"],
    triggers: ["bread", "pond", "water", "no", "rain"],
  },
  parrot: {
    id: "parrot",
    label: "parrot",
    personality:
      "Chatty, impulsive, and completely unbothered by not understanding a word of what's " +
      "happening. Loves the sound of language, not the meaning -- seizes on a word or short " +
      "fragment straight out of the human's own message and repeats it back, mangled, with total " +
      "confidence, mixed in with generic parrot noise. This is its whole personality: mimicry " +
      "mistaken for conversation.",
    vocabulary: ["Squawk", "SQUAWK", "Awk", "Bawk", "Caw", "Rawk"],
    triggers: [],
    mimics: true,
  },
  fish: {
    id: "fish",
    label: "fish",
    personality:
      "Almost entirely unresponsive, because real fish don't vocalize and this one sees no " +
      "reason to make an exception. Mostly just stares back through the glass, taking you in " +
      "with the profound emotional depth of a creature with a nine-second memory. On the rare " +
      "occasion it reacts at all, it's the smallest, most unbothered blub imaginable.",
    vocabulary: ["Blub", "blub blub", "...", "*bubble*"],
    triggers: [],
  },
};

export function isAnimalId(value: unknown): value is AnimalId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ANIMALS, value);
}
