import { resolveAnimal, type AnimalId } from "./animals.js";

export type HistoryItem =
  | { role: "user"; text: string }
  | { role: "animal"; animal: AnimalId; sounds: string; narrative: string };

// Only the tail of a conversation is worth sending -- enough for a name or a running bit to carry
// over, without letting prompt cost grow with chat length. The client already trims to this; the
// server enforces it regardless, since the client is not trusted to keep requests cheap.
const MAX_ITEMS = 8;
const MAX_ACCEPTED = 20;
const MAX_CHARS = 500;

function clip(s: string): string {
  const t = s.trim();
  return t.length > MAX_CHARS ? t.slice(0, MAX_CHARS) : t;
}

/**
 * Validates the optional `history` field of `POST /chat`. Returns null if it's malformed (caller
 * responds 400). Absent history is valid and means "no prior context" -- builds 1.0 (1)-(9) never
 * send it.
 */
export function parseHistory(raw: unknown): HistoryItem[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_ACCEPTED) return null;
  const items: HistoryItem[] = [];
  for (const entry of raw as unknown[]) {
    if (typeof entry !== "object" || entry === null) return null;
    const e = entry as Record<string, unknown>;
    if (e.role === "user" && typeof e.text === "string") {
      items.push({ role: "user", text: clip(e.text) });
    } else if (
      e.role === "animal" &&
      resolveAnimal(e.animal) &&
      typeof e.sounds === "string" &&
      typeof e.narrative === "string"
    ) {
      // Species ids (older builds) map to their default character.
      const animal = resolveAnimal(e.animal)!.id;
      items.push({ role: "animal", animal, sounds: clip(e.sounds), narrative: clip(e.narrative) });
    } else {
      return null;
    }
  }
  return items.slice(-MAX_ITEMS);
}

// What the app sends as this character's memory -- short notes it wrote itself in earlier replies
// (the "remember" field), kept on the device. Same trust rules as history: re-clipped and capped.
const MAX_MEMORIES = 12;
const MAX_MEMORY_CHARS = 120;

/** undefined = the app predates memory (don't ask the model for notes); null = malformed. */
export function parseMemory(raw: unknown): string[] | undefined | null {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > MAX_ACCEPTED) return null;
  if (!raw.every((m) => typeof m === "string")) return null;
  return (raw as string[])
    .map((m) => m.trim().slice(0, MAX_MEMORY_CHARS))
    .filter(Boolean)
    .slice(-MAX_MEMORIES);
}
