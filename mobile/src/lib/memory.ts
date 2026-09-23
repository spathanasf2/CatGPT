import type { AnimalRef } from "./animals";

// What each character remembers about this person, across all chats with them: short notes the
// animal wrote itself (the reply's "remember" field), sent back with every message to that animal.
// Device-local like chat history -- the server never stores them (see the privacy policy).
const KEY = "aineko.memories.v1";
// Matches the server's cap (server/src/history.ts); oldest notes fall off first.
export const MEMORY_LIMIT = 12;

export type MemoryNote = { text: string; at: number };
type Memories = Partial<Record<AnimalRef, MemoryNote[]>>;

function load(): Memories {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Memories) : {};
  } catch {
    return {};
  }
}

function save(memories: Memories): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(memories));
  } catch {
    // best-effort, like chats
  }
}

export function allMemories(): Memories {
  return load();
}

export function memoriesFor(animal: AnimalRef): string[] {
  return (load()[animal] ?? []).map((n) => n.text);
}

export function rememberFor(animal: AnimalRef, text: string): void {
  const memories = load();
  const notes = memories[animal] ?? [];
  // The server already drops reworded repeats; this only catches an exact one.
  if (notes.some((n) => n.text.toLowerCase() === text.toLowerCase())) return;
  memories[animal] = [...notes, { text, at: Date.now() }].slice(-MEMORY_LIMIT);
  save(memories);
}

export function forgetAll(): void {
  save({});
}

// When a custom animal is deleted, what it remembered goes with it.
export function forgetAnimal(animal: AnimalRef): void {
  const memories = load();
  delete memories[animal];
  save(memories);
}
