import type { AnimalId } from "./animals";
import type { ChatMessage } from "./chats";

export type AnimalReply = {
  sounds: string;
  narrative: string;
};

export type HistoryItem =
  | { role: "user"; text: string }
  | { role: "animal"; animal: AnimalId; sounds: string; narrative: string };

// What went wrong, in terms the UI can phrase for a person -- the raw error text ("Load failed",
// "The operation was aborted.") is never meant to reach the chat.
export type ChatErrorKind = "offline" | "timeout" | "rate-limited" | "quota" | "unavailable";

export class ChatError extends Error {
  constructor(
    readonly kind: ChatErrorKind,
    message: string,
  ) {
    super(message);
  }
}

const URL = process.env.NEXT_PUBLIC_AINEKO_SERVER_URL;
const TOKEN = process.env.NEXT_PUBLIC_AINEKO_TOKEN;

// Matches the server's own window (server/src/history.ts), which it enforces regardless.
const HISTORY_LIMIT = 8;
const HISTORY_CHARS = 500;

// The last few turns, so a name or a running bit carries over. Errors are dropped -- they were
// never part of the conversation as far as the animal is concerned.
export function toHistory(messages: ChatMessage[]): HistoryItem[] {
  return messages
    .filter((m) => m.role !== "error")
    .slice(-HISTORY_LIMIT)
    .map((m) =>
      m.role === "user"
        ? { role: "user" as const, text: m.text.slice(0, HISTORY_CHARS) }
        : {
            role: "animal" as const,
            animal: m.animal,
            sounds: m.sounds.slice(0, HISTORY_CHARS),
            narrative: m.narrative.slice(0, HISTORY_CHARS),
          },
    );
}

// The server gives its model fallback chain 18s; this leaves room for the network on top.
export async function askAnimal(
  animal: AnimalId,
  message: string,
  history: HistoryItem[],
  timeoutMs = 25_000,
): Promise<AnimalReply> {
  if (!URL || !TOKEN) throw new ChatError("unavailable", "Aineko server URL or token not configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(`${URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({ animal, message, history }),
        signal: ctrl.signal,
      });
    } catch (err) {
      if (ctrl.signal.aborted) throw new ChatError("timeout", "request timed out");
      throw new ChatError("offline", err instanceof Error ? err.message : "network error");
    }
    const body = (await res.json().catch(() => null)) as
      | { sounds?: unknown; narrative?: unknown; error?: unknown }
      | null;
    if (!res.ok) {
      const reason = typeof body?.error === "string" ? body.error : `server returned ${res.status}`;
      if (res.status === 429) {
        // The token budget's 429s name the window and reset date; the per-minute limiter's don't.
        throw new ChatError(/usage limit/.test(reason) ? "quota" : "rate-limited", reason);
      }
      throw new ChatError("unavailable", reason);
    }
    if (!body || typeof body.sounds !== "string" || typeof body.narrative !== "string") {
      throw new ChatError("unavailable", "invalid response from server");
    }
    return { sounds: body.sounds, narrative: body.narrative };
  } finally {
    clearTimeout(timer);
  }
}
