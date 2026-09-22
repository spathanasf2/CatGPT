import type { Animal, AnimalId } from "./animals.js";
import { ANIMALS } from "./animals.js";
import { MODELS } from "./models.js";
import { recordUsage } from "./usage.js";
import { recordTokens } from "./token-budget.js";
import { log } from "./log.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type AnimalReply = {
  sounds: string;
  narrative: string;
};

function buildSystemPrompt(animal: Animal): string {
  const triggerLine =
    animal.triggers.length > 0
      ? `It listens for a small set of words a real ${animal.label} would plausibly recognize -- things like ${animal.triggers.join(", ")}, its own species called out by name, or whatever else genuinely fits -- and reacts to THOSE specifically, often at the expense of whatever the human actually meant. The comedy is in the mismatch: "I'm exhausted, I can't even walk to the mailbox" can land as an invitation for a walk, and the reaction should commit to that fully, no hedging, no acknowledging the mismatch.`
      : `It has no fixed vocabulary of recognized words -- see its personality above for how it actually processes what it hears.`;

  return `You are roleplaying as a ${animal.label} that a human is talking to, like a chatbot. The ${animal.label} does not understand human language. It cannot form real words. It can only reply with real ${animal.label} vocalizations.

Personality: ${animal.personality}

${triggerLine}

Typical sounds this ${animal.label} makes: ${animal.vocabulary.join(", ")}. Not an exhaustive list -- stay strictly within realistic ${animal.label} vocalizations and whatever the personality above implies about how it uses sound. Never another species' sounds.

Given the human's message, respond with a JSON object with exactly two fields:
- "sounds": a short burst of onomatopoeia (roughly 1 to 6 sounds) reacting emotionally, written the way a comic renders animal noise (e.g. "BORK BORK BORK"). This is literally everything the animal "says" -- no other words, ever.
- "narrative": one short, funny, third-person stage direction wrapped in asterisks. Describe a specific physical action, not a vague mood -- "paws at the door, certain a walk is imminent" beats "seems happy." When a recognized word applies, show what the animal seems to think it heard, even if it's a comically wrong read of the actual message, and commit to that misunderstanding completely. Not every reply needs a misheard word, though -- when nothing recognizable is in the message, just react to the emotional tone of what was said, in character. One sentence. Vary the joke shape across replies; don't lean on the same beat every time.

Respond with ONLY the JSON object. No markdown, no code fences, no extra commentary.`;
}

function parseReply(content: string, animal: Animal): AnimalReply {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("model output was not JSON");
    parsed = JSON.parse(match[0]);
  }
  const obj = parsed as Record<string, unknown>;
  const sounds = typeof obj.sounds === "string" ? obj.sounds.trim() : "";
  const narrative = typeof obj.narrative === "string" ? obj.narrative.trim() : "";
  if (!sounds) throw new Error("model output missing sounds");
  return { sounds, narrative: narrative || `*the ${animal.label} looks at you.*` };
}

async function callOpenRouter(model: string, animal: Animal, message: string, clientIp: string): Promise<AnimalReply> {
  const apiKey = process.env.OPENROUTER_API_KEY!;
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Title": "Aineko",
    },
    body: JSON.stringify({
      model,
      temperature: 1.0,
      response_format: { type: "json_object" },
      // Ask OpenRouter to normalize token accounting across providers -- some
      // upstreams don't report usage by default without this.
      usage: { include: true },
      messages: [
        { role: "system", content: buildSystemPrompt(animal) },
        { role: "user", content: message },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`openrouter ${res.status} (${model}): ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  // Record spend as soon as we know it happened -- OpenRouter billed for these
  // tokens regardless of whether the reply below turns out to be valid JSON.
  if (data.usage) {
    const prompt = data.usage.prompt_tokens ?? 0;
    const completion = data.usage.completion_tokens ?? 0;
    recordUsage(prompt, completion);
    recordTokens(clientIp, prompt + completion);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`openrouter returned no content (${model})`);

  return parseReply(content, animal);
}

export async function askAnimal(
  animalId: AnimalId,
  message: string,
  clientIp: string,
  modelOverride?: string,
): Promise<AnimalReply> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
  const animal = ANIMALS[animalId];

  const primary = modelOverride || process.env.OPENROUTER_MODEL || MODELS[0]!.id;
  const candidates = [primary, ...MODELS.map((m) => m.id).filter((id) => id !== primary)];

  let lastError: unknown;
  for (const model of candidates) {
    try {
      return await callOpenRouter(model, animal, message, clientIp);
    } catch (err) {
      lastError = err;
      log.warn("model failed, trying next fallback", {
        model,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  throw lastError instanceof Error ? lastError : new Error("all models failed");
}
