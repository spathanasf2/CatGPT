import type { AnimalRef } from "./animals";
import { customById, customSpec, isCustomId } from "./custom-animals";
import type { ChatMessage } from "./chats";
import { apiHeaders, serverConfigured, SERVER_URL } from "./api";

export type AnimalReply = {
  sounds: string;
  narrative: string;
  // Something this animal decided to hold onto -- stored by lib/memory.ts.
  remember?: string;
};

export type HistoryItem =
  | { role: "user"; text: string }
  // Custom animals carry their name and species -- the server keeps no record of them.
  | { role: "animal"; animal: AnimalRef; name?: string; species?: string; sounds: string; narrative: string };

// What went wrong, in terms the UI can phrase for a person -- the raw error text ("Load failed",
// "The operation was aborted.") is never meant to reach the chat.
export type ChatErrorKind = "offline" | "timeout" | "rate-limited" | "quota" | "members-only" | "unavailable";

// For "quota": which allowance ran out and when it comes back.
export type QuotaDetail = { tier: "free" | "member"; window: "weekly" | "monthly"; resetAt: string };

export class ChatError extends Error {
  constructor(
    readonly kind: ChatErrorKind,
    message: string,
    readonly quota?: QuotaDetail,
  ) {
    super(message);
  }
}

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
            ...customLabel(m.animal),
            sounds: m.sounds.slice(0, HISTORY_CHARS),
            narrative: m.narrative.slice(0, HISTORY_CHARS),
          },
    );
}

// A custom animal travels as its full spec; the server builds the prompt from it.
function customBody(id: AnimalRef): { custom?: ReturnType<typeof customSpec> } {
  const c = isCustomId(id) ? customById(id) : undefined;
  return c ? { custom: customSpec(c) } : {};
}

function customLabel(id: AnimalRef): { name?: string; species?: string } {
  const c = isCustomId(id) ? customById(id) : undefined;
  return c ? { name: c.name, species: c.species } : {};
}

// The server gives its model fallback chain 18s; this leaves room for the network on top.
export async function askAnimal(
  animal: AnimalRef,
  message: string,
  history: HistoryItem[],
  memory: string[],
  timeoutMs = 25_000,
): Promise<AnimalReply> {
  if (!serverConfigured()) throw new ChatError("unavailable", "Aineko server URL or token not configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(`${SERVER_URL}/chat`, {
        method: "POST",
        headers: { ...apiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ animal, message, history, memory, ...customBody(animal) }),
        signal: ctrl.signal,
      });
    } catch (err) {
      if (ctrl.signal.aborted) throw new ChatError("timeout", "request timed out");
      throw new ChatError("offline", err instanceof Error ? err.message : "network error");
    }
    const body = (await res.json().catch(() => null)) as
      | {
          sounds?: unknown;
          narrative?: unknown;
          remember?: unknown;
          error?: unknown;
          code?: unknown;
          tier?: unknown;
          window?: unknown;
          resetAt?: unknown;
        }
      | null;
    if (!res.ok) {
      const reason = typeof body?.error === "string" ? body.error : `server returned ${res.status}`;
      if (body?.code === "members-only") throw new ChatError("members-only", reason);
      if (body?.code === "quota") {
        const quota: QuotaDetail | undefined =
          (body.tier === "free" || body.tier === "member") &&
          (body.window === "weekly" || body.window === "monthly") &&
          typeof body.resetAt === "string"
            ? ({ tier: body.tier, window: body.window, resetAt: body.resetAt } as QuotaDetail)
            : undefined;
        throw new ChatError("quota", reason, quota);
      }
      if (res.status === 429) throw new ChatError("rate-limited", reason);
      throw new ChatError("unavailable", reason);
    }
    if (!body || typeof body.sounds !== "string" || typeof body.narrative !== "string") {
      throw new ChatError("unavailable", "invalid response from server");
    }
    const reply: AnimalReply = { sounds: body.sounds, narrative: body.narrative };
    if (typeof body.remember === "string" && body.remember.trim()) reply.remember = body.remember.trim();
    return reply;
  } finally {
    clearTimeout(timer);
  }
}
