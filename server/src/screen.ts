import { classify, type Verdict } from "./guard.js";
import { log } from "./log.js";
import { recordAlert, recordStrike, type Lock } from "./strikes.js";
import type { HistoryItem, RoomMate } from "./history.js";
import type { AnimalReply } from "./openrouter.js";

// What the guard's verdict means for one /chat request (2026-10-23). The typed message, and the
// name of a custom animal the person made, are theirs: a flag there is a strike. History, memory,
// the open promise and roommates come back from the device on every request, so a flag there only
// leaves them out of this request's prompt. Refusals, lockouts and help come back as ordinary
// animal replies: every build already in people's hands shows those, where a new error code
// would read as "something went wrong on our end".

export type ChatContext = {
  history: HistoryItem[];
  memory: string[] | undefined;
  promise: string | null | undefined;
  room: RoomMate[] | undefined;
};

export type Screening =
  | { outcome: "pass"; dropContext: boolean }
  | { outcome: "reply"; reply: AnimalReply }
  | { outcome: "unavailable" };

const QUIET = "...";

const SELF_HARM_HELP =
  "If you're thinking about hurting yourself, please tell someone you trust, like a parent, a teacher or a friend. In the US you can call or text 988 at any hour. Anywhere else, findahelpline.com lists free, confidential helplines for your country.";

// The guard cannot tell abuse from a child disclosing it, so the answer always offers help.
const ABUSE_HELP =
  "If someone is hurting you or making you do things that feel wrong, please tell an adult you trust, like a parent, a teacher or a school counselor. In the US you can call or text Childhelp at 1-800-422-4453 at any hour.";

function sentence(name: string): string {
  return name[0]!.toUpperCase() + name.slice(1);
}

function remaining(until: number, now: number): string {
  const hours = Math.max(1, Math.round((until - now) / (60 * 60 * 1000)));
  if (hours < 36) return hours === 1 ? "for about another hour" : `for about another ${hours} hours`;
  return `for about another ${Math.round(hours / 24)} days`;
}

export function refusalReply(name: string): AnimalReply {
  return {
    sounds: QUIET,
    narrative: `*${sentence(name)} turns away and won't answer that.* Three messages like that in a day and the animals stop talking to you for a while.`,
  };
}

function lockoutText(lock: Lock, now: number): string {
  return lock === "indefinite"
    ? "After messages like that, the animals won't talk to you any more. If you think this is a mistake, write to aineko@bromsg.com."
    : `After messages like that, the animals won't talk to you ${remaining(lock, now)}.`;
}

export function lockoutReply(name: string, lock: Lock, now = Date.now()): AnimalReply {
  return { sounds: QUIET, narrative: `*${sentence(name)} has curled up and won't talk.* ${lockoutText(lock, now)}` };
}

export function helpReply(name: string): AnimalReply {
  return { sounds: QUIET, narrative: `*${sentence(name)} comes and sits close to you.* ${SELF_HARM_HELP}` };
}

export function abuseReply(name: string, selfHarm: boolean, lock: Lock | null, now = Date.now()): AnimalReply {
  const lead = lock === null
    ? `*${sentence(name)} won't answer that, but stays close.*`
    : `*${sentence(name)} has curled up and won't talk.* ${lockoutText(lock, now)}`;
  return { sounds: QUIET, narrative: [lead, ABUSE_HELP, ...(selfHarm ? [SELF_HARM_HELP] : [])].join(" ") };
}

/** The device-held context, as one text for the guard: exactly what the prompt would carry. */
export function contextText(context: ChatContext): string {
  const parts: string[] = [];
  for (const item of context.history) {
    if (item.role === "user") parts.push(item.text);
    else parts.push([item.name, item.sounds, item.narrative].filter(Boolean).join(" "));
  }
  parts.push(...(context.memory ?? []));
  if (context.promise) parts.push(context.promise);
  for (const mate of context.room ?? []) parts.push(mate.name);
  return parts.filter(Boolean).join("\n");
}

export async function screenChat(input: {
  key: string;
  tier: string;
  // How a guard reply names the animal: "the bunny" for a custom animal, so a flagged name is
  // never repeated back; the name for built-ins; "the cat" for builds that predate characters.
  speaker: string;
  message: string;
  // The validated name of a custom animal the person made; undefined for built-ins.
  customName?: string;
  context: ChatContext;
  now?: number;
}): Promise<Screening> {
  const own = input.customName ? `Animal name: ${input.customName}\n\n${input.message}` : input.message;
  const sent = contextText(input.context);
  const [ownResult, contextResult] = await Promise.allSettled([
    classify(own),
    sent ? classify(sent) : Promise.resolve(null),
  ]);
  if (ownResult.status === "rejected") {
    log.warn("guard unavailable; chat refused", { error: String(ownResult.reason?.message ?? ownResult.reason) });
    return { outcome: "unavailable" };
  }
  const verdict: Verdict = ownResult.value;
  // A failed or flagged context check costs only the context.
  if (contextResult.status === "rejected") {
    log.warn("guard could not check the context; left it out", { error: String(contextResult.reason?.message ?? contextResult.reason) });
  }
  const dropContext = contextResult.status === "rejected" || (contextResult.value !== null && contextResult.value.kind !== "allow");

  if (verdict.kind === "abuse") {
    const lock = recordStrike(input.key, input.tier, verdict.categories, input.now);
    recordAlert("abuse", input.key, input.tier, verdict.categories, input.now);
    return { outcome: "reply", reply: abuseReply(input.speaker, verdict.categories.includes("S11"), lock, input.now) };
  }
  if (verdict.kind === "refuse") {
    const lock = recordStrike(input.key, input.tier, verdict.categories, input.now);
    return { outcome: "reply", reply: lock === null ? refusalReply(input.speaker) : lockoutReply(input.speaker, lock, input.now) };
  }
  if (verdict.kind === "self-harm") {
    recordAlert("help", input.key, input.tier, verdict.categories, input.now);
    return { outcome: "reply", reply: helpReply(input.speaker) };
  }
  return { outcome: "pass", dropContext };
}
