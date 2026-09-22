import type { AnimalId } from "./animals";

export type AnimalReply = {
  sounds: string;
  narrative: string;
};

const URL = process.env.NEXT_PUBLIC_AINEKO_SERVER_URL;
const TOKEN = process.env.NEXT_PUBLIC_AINEKO_TOKEN;

export async function askAnimal(animal: AnimalId, message: string, timeoutMs = 20_000): Promise<AnimalReply> {
  if (!URL || !TOKEN) throw new Error("Aineko server URL or token not configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ animal, message }),
      signal: ctrl.signal,
    });
    const body = (await res.json().catch(() => null)) as
      | { sounds?: unknown; narrative?: unknown; error?: unknown }
      | null;
    if (!res.ok) {
      const reason = typeof body?.error === "string" ? body.error : `server returned ${res.status}`;
      throw new Error(reason);
    }
    if (!body || typeof body.sounds !== "string" || typeof body.narrative !== "string") {
      throw new Error("invalid response from server");
    }
    return { sounds: body.sounds, narrative: body.narrative };
  } finally {
    clearTimeout(timer);
  }
}
