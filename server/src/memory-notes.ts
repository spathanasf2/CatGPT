// The model re-issues memories it was just shown, reworded ("the walk was promised after dinner"
// for "the human promised a walk after dinner and never took me"), despite being told not to. Two
// notes are the same memory if most of the shorter one's meaningful words appear in the other.
const FILLER = new Set(
  [
    "a an the and or but of to in on at by for with from that this it its",
    "is was were be been am are being have has had will would can could do does did",
    "not no never didn't don't doesn't won't isn't wasn't",
    "i me my mine we our you your he him his she her they them their",
    "human humans person remember remembers remembered once again",
  ]
    .join(" ")
    .split(" "),
);

function keyWords(note: string, name: string): Set<string> {
  const skip = name.toLowerCase();
  return new Set(
    note
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w && !FILLER.has(w) && w !== skip && w !== `${skip}'s`),
  );
}

export function isKnownNote(note: string, memory: string[], name: string): boolean {
  const a = keyWords(note, name);
  if (a.size === 0) return true;
  return memory.some((m) => {
    const b = keyWords(m, name);
    const shared = [...a].filter((w) => b.has(w)).length;
    return shared / Math.min(a.size, b.size || 1) >= 0.6;
  });
}
