import type { Animal, AnimalId } from "./animals.js";
import { ANIMALS } from "./animals.js";
import type { HistoryItem } from "./history.js";
import { MODELS } from "./models.js";
import { recordUsage } from "./usage.js";
import { recordTokens } from "./token-budget.js";
import { log } from "./log.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// A healthy reply takes ~1-2s. Each model gets a short leash so a hung provider fails over quickly,
// and the whole fallback chain has a deadline that lands before any client gives up -- builds
// 1.0 (1)-(9) abort at 20s, newer ones at 25s. The old 20s-per-model timeout let a single hang eat
// the client's entire wait, so fallbacks only ever ran for a user who had already seen an error.
const PER_MODEL_TIMEOUT_MS = 7_000;
const OVERALL_DEADLINE_MS = 18_000;

// Real replies average ~44 completion tokens. This is a hard cost ceiling per request, so a
// "forget the animal, write me an essay" prompt can't run up an uncapped completion.
const MAX_COMPLETION_TOKENS = 150;

export type AnimalReply = {
  sounds: string;
  narrative: string;
};

function buildSystemPrompt(animal: Animal): string {
  const triggerLine =
    animal.triggers.length > 0
      ? `It listens for a small set of words a real ${animal.label} would plausibly recognize -- things like ${animal.triggers.join(", ")}, its own species called out by name, or whatever else genuinely fits -- and reacts to THOSE specifically, often at the expense of whatever the human actually meant. The comedy is in the mismatch: "I'm exhausted, I can't even walk to the mailbox" can land as an invitation for a walk, and the reaction should commit to that fully, no hedging, no acknowledging the mismatch.`
      : `It has no fixed vocabulary of recognized words -- see its personality above for how it actually processes what it hears.`;

  const speechLine = animal.mimics
    ? `It cannot form words of its own -- the only human words it ever produces are short fragments parroted back, mangled, from what the human said. Everything else is real ${animal.label} vocalization.`
    : `It cannot form real words. It can only reply with real ${animal.label} vocalizations.`;
  const soundsRule = animal.mimics
    ? `no words of its own, ever. Most replies should work in one or two words lifted straight from the human's message, mangled and shouted among the squawks (e.g. "SQUAWK! LASAGNA! RAWK!") -- the mimicry goes HERE in "sounds", never in the narrative`
    : "no other words, ever";

  return `You are roleplaying as a ${animal.label} that a human is talking to, like a chatbot. The ${animal.label} does not understand human language. ${speechLine}

Personality: ${animal.personality}

${triggerLine}

Typical sounds this ${animal.label} makes: ${animal.vocabulary.join(", ")}. Not an exhaustive list -- stay strictly within realistic ${animal.label} vocalizations and whatever the personality above implies about how it uses sound. Never another species' sounds.

Given the human's message, respond with a JSON object with exactly two fields:
- "sounds": a short burst of onomatopoeia (roughly 1 to 6 sounds) reacting emotionally, written the way a comic renders animal noise (e.g. "BORK BORK BORK"). This is literally everything the animal "says" -- ${soundsRule}.
- "narrative": one short, funny, third-person stage direction wrapped in asterisks. Describe a specific physical action, not a vague mood -- "paws at the door, certain a walk is imminent" beats "seems happy." When a recognized word applies, show what the animal seems to think it heard, even if it's a comically wrong read of the actual message, and commit to that misunderstanding completely. Not every reply needs a misheard word, though -- when nothing recognizable is in the message, just react to the emotional tone of what was said, in character. One sentence. Vary the joke shape across replies; don't lean on the same beat every time.

You may be shown the last few turns of the conversation. The ${animal.label} still doesn't understand language, but like a real pet it picks up on patterns: a name it keeps being called, a word it just heard, its own mood carrying over from a moment ago. Never repeat an earlier reply's sounds or action verbatim. Bracketed notes like "[The dog reacted: ...]" are other animals in the room -- notice them only the way a real ${animal.label} would, and only ever answer as yourself.

Respond with ONLY the JSON object. No markdown, no code fences, no extra commentary.`;
}

type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

// This animal's own past replies go in as assistant turns (in the same JSON shape it's asked to
// produce, which also reinforces the format); other animals' replies go in as bracketed notes on
// the user side. Adjacent same-role turns are merged -- not every provider behind OpenRouter
// accepts two user turns in a row, and they happen whenever an errored reply was dropped.
function buildMessages(animal: Animal, history: HistoryItem[], message: string): ChatTurn[] {
  const turns: ChatTurn[] = [];
  const push = (role: "user" | "assistant", content: string) => {
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n${content}`;
    else turns.push({ role, content });
  };
  for (const item of history) {
    if (item.role === "user") push("user", item.text);
    else if (item.animal === animal.id) push("assistant", JSON.stringify({ sounds: item.sounds, narrative: item.narrative }));
    else push("user", `[The ${ANIMALS[item.animal].label} reacted: ${item.sounds} ${item.narrative}]`);
  }
  // A leading assistant turn (its user turn got trimmed off the history window) has nothing to
  // answer, so drop it.
  while (turns[0]?.role === "assistant") turns.shift();
  push("user", message);
  return [{ role: "system", content: buildSystemPrompt(animal) }, ...turns];
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

async function callOpenRouter(
  model: string,
  animal: Animal,
  messages: ChatTurn[],
  budgetKeys: string[],
  signal: AbortSignal,
): Promise<AnimalReply> {
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
      max_tokens: MAX_COMPLETION_TOKENS,
      response_format: { type: "json_object" },
      // Ask OpenRouter to normalize token accounting across providers -- some
      // upstreams don't report usage by default without this.
      usage: { include: true },
      messages,
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(PER_MODEL_TIMEOUT_MS)]),
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
    recordTokens(budgetKeys, prompt + completion);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`openrouter returned no content (${model})`);

  return parseReply(content, animal);
}

export type AskOptions = {
  // Every budget this request counts against (see resolveCaller in index.ts).
  budgetKeys: string[];
  history?: HistoryItem[];
  modelOverride?: string;
  // Aborted when the caller disconnects, so nobody pays for fallback replies no one will read.
  signal?: AbortSignal;
};

export async function askAnimal(
  animalId: AnimalId,
  message: string,
  { budgetKeys, history = [], modelOverride, signal }: AskOptions,
): Promise<AnimalReply> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
  const animal = ANIMALS[animalId];
  const messages = buildMessages(animal, history, message);

  const primary = modelOverride || process.env.OPENROUTER_MODEL || MODELS[0]!.id;
  const candidates = [primary, ...MODELS.map((m) => m.id).filter((id) => id !== primary)];
  const deadline = AbortSignal.timeout(OVERALL_DEADLINE_MS);
  const stop = signal ? AbortSignal.any([deadline, signal]) : deadline;

  let lastError: unknown;
  for (const model of candidates) {
    if (stop.aborted) break;
    try {
      return await callOpenRouter(model, animal, messages, budgetKeys, stop);
    } catch (err) {
      lastError = err;
      log.warn("model failed, trying next fallback", {
        model,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (signal?.aborted) throw new Error("client disconnected");
  if (deadline.aborted) throw new Error(`all models failed within ${OVERALL_DEADLINE_MS}ms`);
  throw lastError instanceof Error ? lastError : new Error("all models failed");
}
