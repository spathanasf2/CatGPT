import type { AnimalRef } from "./animals";

// The one thing each animal was promised and is still waiting on ("a walk after dinner"), kept on
// the device. The model flags promises and deliveries (server/src/openrouter.ts); a nudge brings up
// one that's never kept. Stale after a week -- nobody wants to hear about last month's walk.
const KEY = "aineko.promises.v1";
const STALE_MS = 7 * 24 * 3600_000;

type Promise_ = { text: string; at: number };

function load(): Partial<Record<AnimalRef, Promise_>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function save(p: Partial<Record<AnimalRef, Promise_>>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // best-effort, like memories
  }
}

export function openPromise(animal: AnimalRef, now = Date.now()): string | null {
  const p = load()[animal];
  return p && now - p.at < STALE_MS ? p.text : null;
}

export function setPromise(animal: AnimalRef, text: string): void {
  save({ ...load(), [animal]: { text, at: Date.now() } });
}

export function clearPromise(animal?: AnimalRef): void {
  if (!animal) return save({});
  const p = load();
  delete p[animal];
  save(p);
}
