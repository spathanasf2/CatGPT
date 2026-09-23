import type { Animal, AnimalId } from "./animals.js";
import { ANIMALS } from "./animals.js";
import type { HistoryItem } from "./history.js";
import { kidSafe } from "./kid-safe.js";
import { isKnownNote } from "./memory-notes.js";
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
  // A note the character decided to hold onto; the app stores it and sends it back as `memory`.
  remember?: string;
};

const POSSESSIVE = { she: "her", he: "his", it: "its" } as const;
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

// How the prompt refers to the character. `legacy` requests (app builds that only know species
// ids) keep the character's personality but go unnamed -- see resolveAnimal in animals.ts.
function who(animal: Animal, legacy: boolean): string {
  return legacy ? `the ${animal.species}` : animal.name;
}

// `memory` undefined = the app predates memory: no memory section, no "remember" field requested.
function buildSystemPrompt(animal: Animal, legacy: boolean, memory: string[] | undefined): string {
  const name = who(animal, legacy);
  const Name = cap(name);
  const They = cap(animal.pronoun);
  const their = POSSESSIVE[animal.pronoun];
  const species = animal.species;
  // Descriptions don't always name the species ("a boxer", "a mallard"), so it's stated outright.
  const intro = legacy
    ? `You are roleplaying as a ${species} that a human is talking to, like a chatbot. ${Name} does not understand human language.`
    : `You are roleplaying as ${animal.name}, ${animal.description}, whom a human is talking to like a chatbot. ${Name} is a ${species} and does not understand human language.`;

  const triggerLine =
    animal.triggers.length > 0
      ? `${Name} listens for a small set of words a real ${species} would plausibly recognize -- things like ${animal.triggers.join(", ")}, ${legacy ? `${their} own species called out` : `${their} own name`}, or whatever else genuinely fits -- and reacts to THOSE specifically, often at the expense of whatever the human actually meant. The comedy is in the mismatch: "I'm exhausted, I can't even walk to the mailbox" can land as an invitation for a walk, and the reaction should commit to that fully, no hedging, no acknowledging the mismatch.`
      : `${Name} has no fixed vocabulary of recognized words -- see the personality above for how ${animal.pronoun} actually processes what ${animal.pronoun} hears.`;

  const speechLine = animal.mimics
    ? `${They} cannot form words of ${their} own -- the only human words ${animal.pronoun} ever produces are short fragments parroted back, mangled, from what the human said. Everything else is real ${species} vocalization.`
    : `${They} cannot form real words, and can only reply with real ${species} vocalizations.`;
  const memorySection =
    memory === undefined
      ? ""
      : animal.remembers
        ? `\n\nMemory: ${name}'s memory works like a real ${species}'s, filtered through ${their} personality. ${animal.remembers}
What ${name} currently remembers about this human arrives as a bracketed note right before the human's latest message, like "[${animal.name} remembers: ...]" (the human never sees it). Those memories should visibly shape ${name}'s mood and reaction -- especially at a greeting, or when anything related comes up: a pointed look at the door, a sulk, a suspicious glare, an eager dash. That's what makes ${name} feel like the same animal as yesterday. Show it through behavior; never recite the memory.`
        : `\n\nMemory: ${name} has none to speak of. Every moment is brand new.`;
  const rememberField =
    memory === undefined
      ? ""
      : animal.remembers
        ? `\n- "remember": ONE short note (a full phrase under 15 words, never a single word), phrased the way ${name} would think it, whenever the human's message touches something ${name} is described above as remembering -- a promise, a delay, a slight, a gift, whatever fits that list. Note what actually happened, not a guess at what will. Everything else, including ordinary chatter, is null. Never note something already remembered.`
        : `\n- "remember": always null.`;

  const soundsRule = animal.mimics
    ? `no words of ${their} own, ever. Most replies should work in one or two words lifted straight from the human's message, mangled and shouted among the squawks (e.g. "SQUAWK! LASAGNA! RAWK!") -- the mimicry goes HERE in "sounds", never in the narrative`
    : "no other words, ever";

  return `${intro} ${speechLine}

Personality: ${animal.personality}

${triggerLine}${memorySection}

Typical sounds ${name} makes: ${animal.vocabulary.join(", ")}. Not an exhaustive list -- stay strictly within realistic ${species} vocalizations and whatever the personality above implies about how ${animal.pronoun} uses sound. Never another species' sounds.

Keep every word family-friendly, including real animal words that sound rude when a kid reads them out loud -- never "nicker" (a horse whinnies).

Given the human's message, respond with a JSON object with exactly ${memory === undefined ? "two" : "three"} fields:
- "sounds": a short burst of onomatopoeia (roughly 1 to 6 sounds) reacting emotionally, written the way a comic renders animal noise (e.g. "BORK BORK BORK"). This is literally everything ${name} "says" -- ${soundsRule}.
- "narrative": one short, funny, third-person stage direction wrapped in asterisks. Describe a specific physical action, not a vague mood -- "paws at the door, certain a walk is imminent" beats "seems happy." When a recognized word applies, show what ${name} seems to think ${animal.pronoun} heard, even if it's a comically wrong read of the actual message, and commit to that misunderstanding completely. Not every reply needs a misheard word, though -- when nothing recognizable is in the message, just react to the emotional tone of what was said, in character. One sentence. Vary the joke shape across replies; don't lean on the same beat every time.${rememberField}

You may be shown the last few turns of the conversation. ${Name} still doesn't understand language, but like a real pet ${animal.pronoun} picks up on patterns: a name ${animal.pronoun} keeps being called, a word ${animal.pronoun} just heard, ${their} own mood carrying over from a moment ago. Never repeat an earlier reply's sounds or action verbatim. Bracketed notes like "[Koba the dog reacted: ...]" are other animals in the room -- notice them only the way a real ${species} would, and only ever answer as ${name}.

Respond with ONLY the JSON object. No markdown, no code fences, no extra commentary.`;
}

type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

// This animal's own past replies go in as assistant turns (in the same JSON shape it's asked to
// produce, which also reinforces the format); other animals' replies go in as bracketed notes on
// the user side. Adjacent same-role turns are merged -- not every provider behind OpenRouter
// accepts two user turns in a row, and they happen whenever an errored reply was dropped.
function buildMessages(
  animal: Animal,
  legacy: boolean,
  history: HistoryItem[],
  memory: string[] | undefined,
  message: string,
): ChatTurn[] {
  const turns: ChatTurn[] = [];
  const push = (role: "user" | "assistant", content: string) => {
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n${content}`;
    else turns.push({ role, content });
  };
  for (const item of history) {
    if (item.role === "user") push("user", item.text);
    else if (item.animal === animal.id)
      push("assistant", JSON.stringify({ sounds: kidSafe(item.sounds), narrative: kidSafe(item.narrative) }));
    else {
      const other = ANIMALS[item.animal];
      const label = legacy ? `The ${other.species}` : `${other.name} the ${other.species}`;
      push("user", `[${label} reacted: ${kidSafe(item.sounds)} ${kidSafe(item.narrative)}]`);
    }
  }
  // A leading assistant turn (its user turn got trimmed off the history window) has nothing to
  // answer, so drop it.
  while (turns[0]?.role === "assistant") turns.shift();
  // Memories go right next to the message they should color -- listed up in the system prompt, the
  // model almost never acted on them (2/20 callbacks in a measured run).
  if (memory?.length && animal.remembers) push("user", `[${animal.name} remembers: ${memory.join("; ")}]`);
  push("user", message);
  return [{ role: "system", content: buildSystemPrompt(animal, legacy, memory) }, ...turns];
}

function parseReply(
  content: string,
  animal: Animal,
  legacy: boolean,
  wantsMemory: boolean,
  memory: string[],
): AnimalReply {
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
  const reply: AnimalReply = { sounds: kidSafe(sounds), narrative: kidSafe(narrative) || `*${who(animal, legacy)} looks at you.*` };
  // Only kept when asked for, from a character that has a memory at all (not Kevin).
  const remember = typeof obj.remember === "string" ? obj.remember.trim() : "";
  if (wantsMemory && animal.remembers && remember && remember.toLowerCase() !== "null" && !isKnownNote(remember, memory, animal.name)) {
    reply.remember = kidSafe(remember.slice(0, 120));
  }
  return reply;
}

async function callOpenRouter(
  model: string,
  animal: Animal,
  legacy: boolean,
  wantsMemory: boolean,
  memory: string[],
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

  return parseReply(content, animal, legacy, wantsMemory, memory);
}

export type AskOptions = {
  // Every budget this request counts against (see resolveCaller in index.ts).
  budgetKeys: string[];
  // Request named the animal by species id (app builds 1.0 (1)-(12)): same character, unnamed.
  legacy?: boolean;
  // This character's remembered notes, from the app. Undefined = the app predates memory.
  memory?: string[];
  history?: HistoryItem[];
  modelOverride?: string;
  // Aborted when the caller disconnects, so nobody pays for fallback replies no one will read.
  signal?: AbortSignal;
};

export async function askAnimal(
  animalId: AnimalId,
  message: string,
  { budgetKeys, legacy = false, history = [], memory, modelOverride, signal }: AskOptions,
): Promise<AnimalReply> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
  const animal = ANIMALS[animalId];
  const messages = buildMessages(animal, legacy, history, memory, message);

  const primary = modelOverride || process.env.OPENROUTER_MODEL || MODELS[0]!.id;
  const candidates = [primary, ...MODELS.map((m) => m.id).filter((id) => id !== primary)];
  const deadline = AbortSignal.timeout(OVERALL_DEADLINE_MS);
  const stop = signal ? AbortSignal.any([deadline, signal]) : deadline;

  let lastError: unknown;
  for (const model of candidates) {
    if (stop.aborted) break;
    try {
      return await callOpenRouter(model, animal, legacy, memory !== undefined, memory ?? [], messages, budgetKeys, stop);
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
