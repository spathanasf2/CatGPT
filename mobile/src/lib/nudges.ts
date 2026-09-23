import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { animalById, type AnimalMeta, type AnimalRef } from "./animals";
import type { Chat } from "./chats";
import { openPromise } from "./promises";
import { customById, isCustomId } from "./custom-animals";

// "Let them miss you" (opt-in). Rules, from Frank (2026-09-23):
//  - only once they haven't opened the app in a while: nothing before ~2 days away;
//  - at most once a day: 6pm on day 2, day 4 and day 7 after they left, then it stops;
//  - only from the 1-2 animals they talk to most, alternating;
//  - pegged to something real when possible: a promise they never kept ("a walk after dinner"),
//    otherwise being ignored, in that animal's voice; lines rotate so they don't repeat.
// Scheduled as the app goes to the background, all cancelled when it comes back. On-device only.
const KEY = "aineko.nudges.v1";
const ROTATION_KEY = "aineko.nudgeRotation.v1";
const NUDGE_IDS = [4201, 4203, 4204];
const PREVIEW_ID = 4202;
const DAYS_AFTER_LEAVING = [2, 4, 7];

export function nudgesAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

export function nudgesOn(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

/** Asks iOS for permission; true if granted (and switched on). */
export async function enableNudges(): Promise<boolean> {
  if (!nudgesAvailable()) return false;
  const { display } = await LocalNotifications.requestPermissions();
  if (display !== "granted") return false;
  try {
    localStorage.setItem(KEY, "on");
  } catch {
    // storage blocked: stays off
  }
  return true;
}

export async function disableNudges(): Promise<void> {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to remove
  }
  await cancelNudges();
}

// 6pm local on the Nth day after leaving; day 2 is always at least ~44 hours away.
export function nudgeTimes(now = new Date()): Date[] {
  const first = new Date(now.getTime() + 44 * 3600_000);
  if (first.getHours() >= 18) first.setDate(first.getDate() + 1);
  first.setHours(18, 0, 0, 0);
  return DAYS_AFTER_LEAVING.map((day) => {
    const at = new Date(first);
    at.setDate(first.getDate() + (day - DAYS_AFTER_LEAVING[0]!));
    return at;
  });
}

// In each character's voice; plain and kid-safe. {promise} is what they're still waiting for.
type Lines = { ignored: string[]; promise: string[] };
const LINES: Record<string, Lines> = {
  hayley: {
    ignored: ["Hayley has checked the door eleven times today.", "Hayley brought you something. It's (mostly) still alive.", "Hayley has been sleeping on your pillow. In protest."],
    promise: ["Hayley would like a word about {promise}.", "Hayley is sitting by her bowl. She remembers {promise}.", "Hayley has not forgotten {promise}. She never forgets."],
  },
  koba: {
    ignored: ["Koba has been staring at the door all day.", "Koba is holding your shoe. He'd like to discuss it.", "The bed is all Koba's now. He'd like you to see."],
    promise: ["Koba is still waiting for {promise}. He's by the door.", "Koba brought you the leash. It's about {promise}.", "Koba forgot everything else, but not {promise}."],
  },
  dolores: {
    ignored: ["Dolores has been thinking. Mostly about grass.", "Dolores mooed once today, in your general direction.", "Dolores has stood in the same spot all day. She'd like you to know."],
    promise: ["Dolores is still waiting on {promise}. She can wait. She's very good at it.", "Dolores has been chewing on {promise} all day."],
  },
  gerald: {
    ignored: ["Gerald is reviewing your account. It's overdue.", "Gerald has concerns about the bread situation.", "Gerald waited at the pond all day. He's filing a complaint."],
    promise: ["Gerald has you down for {promise}. Payment is overdue.", "Gerald is here to collect on {promise}.", "Gerald would like to remind you about {promise}. Loudly."],
  },
  winston: {
    ignored: ["Winston has been practicing your name. It's not going well.", "Winston learned a new sound. It's the microwave again.", "Winston talked to himself all day. Mostly about you."],
    promise: ["Winston keeps squawking about {promise}. Over and over.", "Winston remembers {promise}. At full volume."],
  },
  kevin: {
    ignored: ["Kevin does not remember you. He'd love to meet you.", "Blub.", "Kevin swam in a circle today. It was a big day."],
    promise: ["Kevin has already forgotten {promise}. You're off the hook."],
  },
  mortimer: {
    ignored: ["Mortimer has noticed you're gone. He's fine. Totally fine.", "Mortimer knocked something off a shelf. Pointedly.", "Mortimer ignored you all day. He'd like you to have noticed."],
    promise: ["Mortimer is keeping a list. {promise} is on it.", "Mortimer remembers {promise}. He expected nothing, and is still disappointed."],
  },
  peanut: {
    ignored: ["Peanut guarded the house against the mail all day. Alone.", "Peanut is trembling. Probably about you.", "Peanut barked at the door all day, in case it was you."],
    promise: ["Peanut is still waiting for {promise}. Suspiciously.", "Peanut has not forgotten {promise}. Peanut forgets nothing."],
  },
  tank: {
    ignored: ["Tank found a plastic bag. It's going badly.", "Tank would like to discuss carrots.", "Tank stood at the fence all day, looking for you."],
    promise: ["Tank is still waiting for {promise}. He's checked your pockets twice.", "Tank remembers {promise}. Tank remembers everything that involves carrots."],
  },
  barbara: {
    ignored: ["Barbara ate something. It might have been yours.", "Barbara is on the roof again.", "Barbara screamed at the door all day. It might have been about you."],
    promise: ["Barbara is still waiting for {promise}. She ate the mail in the meantime.", "Barbara has been screaming about {promise} all day."],
  },
  noodle: {
    ignored: ["Noodle has moved one inch toward the door.", "Noodle is basking. It has noticed you're not here.", "Noodle has been very still all day. Even for Noodle."],
    promise: ["Noodle is still waiting on {promise}. Patiently. Very patiently.", "Noodle remembers {promise}. Cold-blooded, not forgetful."],
  },
};
const CUSTOM_LINES: Lines = {
  ignored: ["{name} is wondering where you went.", "{name} waited by the door all day.", "{name} would like to see you."],
  promise: ["{name} is still waiting for {promise}.", "{name} hasn't forgotten {promise}."],
};

// "Switch it up": each animal's lines come around in turn instead of at random.
function nextLine(key: string, lines: string[]): string {
  let rotation: Record<string, number> = {};
  try {
    rotation = JSON.parse(localStorage.getItem(ROTATION_KEY) ?? "{}");
  } catch {
    rotation = {};
  }
  const i = rotation[key] ?? 0;
  rotation[key] = i + 1;
  try {
    localStorage.setItem(ROTATION_KEY, JSON.stringify(rotation));
  } catch {
    // rotation just won't persist
  }
  return lines[i % lines.length]!;
}

export function nudgeText(animal: AnimalMeta, promise: string | null): string {
  const lines = LINES[animal.id] ?? CUSTOM_LINES;
  const fill = (line: string) => line.replace("{name}", animal.name).replace("{promise}", promise ?? "");
  if (promise) return fill(nextLine(`${animal.id}:promise`, lines.promise));
  return fill(nextLine(`${animal.id}:ignored`, lines.ignored));
}

/** The 1-2 animals they talk to most (by replies across all chats), skipping deleted ones. */
export function favoriteAnimals(chats: Chat[], limit = 2): AnimalRef[] {
  const counts = new Map<AnimalRef, number>();
  for (const chat of chats) {
    for (const m of chat.messages) if (m.role === "animal") counts.set(m.animal, (counts.get(m.animal) ?? 0) + 1);
  }
  return [...counts.entries()]
    // Soft-deleted custom animals still resolve (their old messages render), so check explicitly.
    .filter(([id]) => animalById(id).id === id && !(isCustomId(id) && customById(id)?.deleted))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

// Day 2, 4, 7: alternating between the favorites. An open promise is brought up once, first.
export function planNudges(favorites: AnimalRef[], times: Date[]) {
  const promisesUsed = new Set<AnimalRef>();
  return times.map((at, i) => {
    const id = favorites[i % favorites.length]!;
    const animal = animalById(id);
    const promise = promisesUsed.has(id) ? null : openPromise(id);
    if (promise) promisesUsed.add(id);
    return { id: NUDGE_IDS[i]!, at, animal, body: nudgeText(animal, promise) };
  });
}

export async function scheduleNudges(chats: Chat[]): Promise<void> {
  if (!nudgesAvailable() || !nudgesOn()) return;
  const favorites = favoriteAnimals(chats);
  await cancelNudges();
  if (favorites.length === 0) return;
  await LocalNotifications.schedule({
    notifications: planNudges(favorites, nudgeTimes()).map((n) => ({
      id: n.id,
      title: n.animal.name,
      body: n.body,
      schedule: { at: n.at, allowWhileIdle: true },
      extra: { animal: n.animal.id },
    })),
  });
}

/** Settings > Preview: what the first one would say, in 5 seconds. */
export async function previewNudge(chats: Chat[], fallback: AnimalRef): Promise<void> {
  if (!nudgesAvailable()) return;
  const id = favoriteAnimals(chats)[0] ?? fallback;
  const animal = animalById(id);
  await LocalNotifications.schedule({
    notifications: [
      {
        id: PREVIEW_ID,
        title: animal.name,
        body: nudgeText(animal, openPromise(id)),
        schedule: { at: new Date(Date.now() + 5_000), allowWhileIdle: true },
        extra: { animal: animal.id },
      },
    ],
  });
}

export async function cancelNudges(): Promise<void> {
  if (!nudgesAvailable()) return;
  await LocalNotifications.cancel({ notifications: NUDGE_IDS.map((id) => ({ id })) }).catch(() => undefined);
}

/** Calls back with the animal id when someone taps a nudge. Returns an unsubscribe. */
export function onNudgeTapped(open: (animal: string) => void): () => void {
  if (!nudgesAvailable()) return () => undefined;
  const handle = LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
    const animal = action.notification.extra?.animal;
    if (typeof animal === "string") open(animal);
  });
  return () => {
    handle.then((h) => h.remove()).catch(() => undefined);
  };
}

