import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { AnimalMeta } from "./animals";

// "Hayley misses you" (1.2, opt-in): one local notification, scheduled when the app goes to the
// background and cancelled when it comes back, from whoever you talked to last. Entirely on the
// device -- no server, no push service, nothing about the person leaves the phone.
const KEY = "aineko.nudges.v1";
const NUDGE_ID = 4201;
const PREVIEW_ID = 4202;

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
  await cancelNudge();
}

// About two days after you leave, at 6pm your time: the first 6pm at least 44 hours out.
export function nextNudgeTime(now = new Date()): Date {
  const at = new Date(now.getTime() + 44 * 3600_000);
  if (at.getHours() >= 18) at.setDate(at.getDate() + 1);
  at.setHours(18, 0, 0, 0);
  return at;
}

// Written per character, in their voice; plain and kid-safe.
const LINES: Record<string, string[]> = {
  hayley: ["Hayley is waiting by the door. Dinner is presumably involved.", "Hayley brought you something. It's (mostly) still alive.", "Hayley would like a word about dinner."],
  koba: ["Koba is sitting by the door with the leash. Just so you know.", "Koba has been holding this toy for you for hours. You still can't have it.", "The bed is all Koba's now. He'd like you to see."],
  dolores: ["Dolores has been thinking. Mostly about grass.", "Dolores mooed once, in your general direction."],
  gerald: ["Gerald is reviewing your account. It's overdue.", "Gerald has concerns about the bread situation."],
  winston: ["Winston has been practicing your name. It's not going well.", "Winston learned a new sound. It's the microwave again."],
  kevin: ["Kevin does not remember you. He'd love to meet you.", "Blub."],
  mortimer: ["Mortimer has noticed you're gone. He's fine. Totally fine.", "Mortimer knocked something off a shelf. Pointedly."],
  peanut: ["Peanut has been guarding the house against the mail. Alone.", "Peanut is trembling. Probably about you."],
  tank: ["Tank found a plastic bag. It's going badly.", "Tank would like to discuss carrots."],
  barbara: ["Barbara ate something. It might have been yours.", "Barbara is on the roof again."],
  noodle: ["Noodle has moved one inch toward the door.", "Noodle is basking. It has noticed you're not here."],
};
const CUSTOM_LINES = ["{name} is wondering where you went.", "{name} has been waiting for you.", "{name} would like to see you."];

export function nudgeText(animal: AnimalMeta, memories: string[], random = Math.random): string {
  // Sometimes it's a memory -- the grudge or the promise they're still holding onto.
  const note = memories[memories.length - 1];
  if (note && animal.id !== "kevin" && random() < 0.4) {
    return `${animal.name} hasn't forgotten: ${note[0]!.toLowerCase()}${note.slice(1).replace(/[.!]*$/, "")}.`;
  }
  const lines = LINES[animal.id] ?? CUSTOM_LINES;
  return lines[Math.floor(random() * lines.length)]!.replace("{name}", animal.name);
}

export async function scheduleNudge(animal: AnimalMeta, memories: string[], at = nextNudgeTime(), preview = false): Promise<void> {
  if (!nudgesAvailable() || (!preview && !nudgesOn())) return;
  if (!preview) await cancelNudge();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: preview ? PREVIEW_ID : NUDGE_ID,
        title: animal.name,
        body: nudgeText(animal, memories),
        schedule: { at, allowWhileIdle: true },
        extra: { animal: animal.id },
      },
    ],
  });
}

export async function cancelNudge(): Promise<void> {
  if (!nudgesAvailable()) return;
  await LocalNotifications.cancel({ notifications: [{ id: NUDGE_ID }] }).catch(() => undefined);
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
