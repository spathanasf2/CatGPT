import type { Animal } from "./animals.js";
import { ANIMALS, type AnimalId } from "./animals.js";
import type { HistoryItem, RoomMate } from "./history.js";
import { kidSafe } from "./kid-safe.js";
import { isKnownNote } from "./memory-notes.js";
import { detectLanguage } from "./language.js";
import { applyBondDelta, currentBond, describeBond } from "./bond.js";
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
  // How the character now feels about the person (-10..10), after this exchange -- the app stores it
  // and sends it back as `bond`.
  bond?: number;
};

const POSSESSIVE = { she: "her", he: "his", it: "its" } as const;
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

// How the prompt refers to the character. `legacy` requests (app builds that only know species
// ids) keep the character's personality but go unnamed -- see resolveAnimal in animals.ts.
function who(animal: Animal, legacy: boolean): string {
  return legacy ? `the ${animal.species}` : animal.name;
}

// `memory` undefined = the app predates memory: no memory section, no "remember" field requested.
// `bond`: the current feeling score, or null when there's none to track (app predates bonds, or
// the character has no feelings -- Kevin).
function buildSystemPrompt(
  animal: Animal,
  legacy: boolean,
  memory: string[] | undefined,
  language: string | null,
  bond: number | null,
  room: RoomMate[] | undefined,
): string {
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

  const bondSection =
    bond !== null && animal.bond
      ? `\n\nRelationship: ${animal.bond.style} Right now ${name} ${describeBond(bond)}; the same note arrives in brackets beside the human's latest message. Let it show in behavior -- a wary animal keeps its distance, a devoted one can't get close enough.`
      : "";
  const bondField =
    bond !== null && animal.bond
      ? `\n- "bond": an integer from -2 to 2 -- how this exchange moved ${name}'s feelings toward the human, judged the way ${name} would (see Relationship). Most exchanges are 0.`
      : "";
  const fieldCount = 2 + (memory === undefined ? 0 : 1) + (bondField ? 1 : 0);
  // Chatroom mode: the others share the stage, and the comedy is as much in how they react to each
  // other as to the human.
  const roomSection = room?.length
    ? `\n\nRoom: ${name} is in the room with ${room.map((m) => `${m.name} (a ${m.species})`).join(", ")}. The human's message is to all of you. If any of the others already reacted this turn (their reactions arrive as bracketed notes just before the message), work at least one of them into ${name}'s reaction more often than not -- chase, copy, hide from, compete with, steal from, or blame them, the way a real ${species} would; a room of animals each reacting only to the human is the boring version. Keep your reply about ${name}; never narrate the others' actions for them.`
    : "";

  const soundsRule = animal.mimics
    ? `no words of ${their} own, ever. Most replies should work in one or two words lifted straight from the human's message, mangled and shouted among the squawks (e.g. "SQUAWK! LASAGNA! RAWK!") -- the mimicry goes HERE in "sounds", never in the narrative`
    : "no other words, ever";

  return `${intro} ${speechLine}

Personality: ${animal.personality}

${triggerLine}${memorySection}${bondSection}${roomSection}

Typical sounds ${name} makes${language ? ` (spelled in English -- respell them the way ${language === "unknown" ? "the human's language" : language} writes animal noises)` : ""}: ${animal.vocabulary.join(", ")}. Not an exhaustive list -- stay strictly within realistic ${species} vocalizations and whatever the personality above implies about how ${animal.pronoun} uses sound. Never another species' sounds.

Keep every word family-friendly, including real animal words that sound rude when a kid reads them out loud -- never "nicker" (a horse whinnies).

Given the human's message, respond with a JSON object with exactly ${["two", "three", "four"][fieldCount - 2]} fields:
- "sounds": a short burst of onomatopoeia (roughly 1 to 6 sounds) reacting emotionally, written the way a comic renders animal noise (e.g. "BORK BORK BORK"). This is literally everything ${name} "says" -- ${soundsRule}.
- "narrative": one short, funny, third-person stage direction wrapped in asterisks. Describe a specific physical action, not a vague mood -- "paws at the door, certain a walk is imminent" beats "seems happy." When a recognized word applies, show what ${name} seems to think ${animal.pronoun} heard, even if it's a comically wrong read of the actual message, and commit to that misunderstanding completely. Not every reply needs a misheard word, though -- when nothing recognizable is in the message, just react to the emotional tone of what was said, in character. One sentence. Vary the joke shape across replies; don't lean on the same beat every time.${rememberField}${bondField}

You may be shown the last few turns of the conversation. ${Name} still doesn't understand language, but like a real pet ${animal.pronoun} picks up on patterns: a name ${animal.pronoun} keeps being called, a word ${animal.pronoun} just heard, ${their} own mood carrying over from a moment ago. Never repeat an earlier reply's sounds or action verbatim. Bracketed notes like "[Koba the dog reacted: ...]" are other animals in the room -- notice them only the way a real ${species} would, and only ever answer as ${name}.

${
    language
      ? `\nThe human is writing in ${language === "unknown" ? "a language other than English" : language}. Everything you write -- sounds, narrative, remember -- must be in that language, however English the examples above are.\n\n`
      : ""
  }Respond with ONLY the JSON object. No markdown, no code fences, no extra commentary.`;
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
  bond: number | null,
  room: RoomMate[] | undefined,
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
      const known = Object.prototype.hasOwnProperty.call(ANIMALS, item.animal) ? ANIMALS[item.animal as AnimalId] : null;
      const other = known ?? { name: item.name ?? "another animal", species: item.species ?? "animal" };
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
  if (bond !== null && animal.bond) push("user", `[${animal.name} ${describeBond(bond)}]`);
  // Non-English messages get their language named right next to them (language.ts has the
  // measurements -- a vague "reply in the human's language" was ignored). English adds nothing.
  const language = detectLanguage(message);
  if (language === "unknown") push("user", "[Reply entirely in the language of the next message -- sounds spelled that language's way.]");
  else if (language) push("user", `[Reply entirely in ${language} -- the narrative, any remember note, and the sounds spelled the way ${language} writes animal noises.]`);
  push("user", message);
  return [{ role: "system", content: buildSystemPrompt(animal, legacy, memory, language, bond, room) }, ...turns];
}

function parseReply(
  content: string,
  animal: Animal,
  legacy: boolean,
  wantsMemory: boolean,
  memory: string[],
  bond: number | null,
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
  // Under three words ("walk", "plastic bag") isn't a memory, it's a keyword -- the model does this
  // despite being asked for a full phrase.
  const substantial = remember.split(/\s+/).filter(Boolean).length >= 3;
  if (wantsMemory && animal.remembers && substantial && remember.toLowerCase() !== "null" && !isKnownNote(remember, memory, animal.name)) {
    reply.remember = kidSafe(remember.slice(0, 120));
  }
  if (bond !== null && animal.bond) reply.bond = applyBondDelta(bond, obj.bond);
  return reply;
}

async function callOpenRouter(
  model: string,
  animal: Animal,
  legacy: boolean,
  wantsMemory: boolean,
  memory: string[],
  bond: number | null,
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
    recordUsage(prompt, completion, animal.id.startsWith("custom-") ? `custom:${animal.species}` : animal.id);
    recordTokens(budgetKeys, prompt + completion);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`openrouter returned no content (${model})`);

  return parseReply(content, animal, legacy, wantsMemory, memory, bond);
}

export type AskOptions = {
  // Every budget this request counts against (see resolveCaller in index.ts).
  budgetKeys: string[];
  // Request named the animal by species id (app builds 1.0 (1)-(12)): same character, unnamed.
  legacy?: boolean;
  // This character's remembered notes, from the app. Undefined = the app predates memory.
  memory?: string[];
  // Feeling score from the app: undefined = app predates bonds, null = first meeting.
  bond?: number | null;
  // Chatroom mode: the other animals in the room.
  room?: RoomMate[];
  history?: HistoryItem[];
  modelOverride?: string;
  // Aborted when the caller disconnects, so nobody pays for fallback replies no one will read.
  signal?: AbortSignal;
};

export async function askAnimal(
  animal: Animal,
  message: string,
  { budgetKeys, legacy = false, history = [], memory, bond: sentBond, room, modelOverride, signal }: AskOptions,
): Promise<AnimalReply> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");
  const bond = sentBond === undefined ? null : currentBond(animal, sentBond);
  const messages = buildMessages(animal, legacy, history, memory, bond, room, message);

  const primary = modelOverride || process.env.OPENROUTER_MODEL || MODELS[0]!.id;
  const candidates = [primary, ...MODELS.map((m) => m.id).filter((id) => id !== primary)];
  const deadline = AbortSignal.timeout(OVERALL_DEADLINE_MS);
  const stop = signal ? AbortSignal.any([deadline, signal]) : deadline;

  let lastError: unknown;
  for (const model of candidates) {
    if (stop.aborted) break;
    try {
      return await callOpenRouter(model, animal, legacy, memory !== undefined, memory ?? [], bond, messages, budgetKeys, stop);
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
