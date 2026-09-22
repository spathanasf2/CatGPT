export type ModelOption = { id: string; label: string };

// This list is an internal/ops concern, not something the app UI exposes -- users pick
// an animal to talk to, never a backend model. It exists so (a) `askAnimal` has a short
// ordered list of cheap models to automatically fall back through if the primary one
// errors or rate-limits (the free model that crapped out on 2026-09-21 is exactly the
// failure this covers), and (b) `/models` + `POST /chat`'s optional `model` field stay
// available for our own testing without trusting an open-ended, possibly expensive
// client-supplied model string. First entry is the default.
export const MODELS: ModelOption[] = [
  { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { id: "openai/gpt-4.1-nano", label: "GPT-4.1 Nano" },
  { id: "meta-llama/llama-3.1-8b-instruct", label: "Llama 3.1 8B" },
];

export function isAllowedModel(id: unknown): id is string {
  return typeof id === "string" && MODELS.some((m) => m.id === id);
}
