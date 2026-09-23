import { ANIMALS, normalizeAnimalId, type AnimalRef } from "./animals";
import { newId } from "./ids";

export type ChatMessage =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "animal";
      animal: AnimalRef;
      sounds: string;
      narrative: string;
      // The memory this reply created, if any -- shown under the bubble.
      remembered?: string;
      // Set when this reply moved the animal's feelings into a new level ("is warming up to you").
      bondNote?: { text: string; warmer: boolean };
    }
  // `animal` / `retryable` / `action` are absent on errors saved by builds 1.0 (1)-(9).
  | {
      id: string;
      role: "error";
      text: string;
      animal?: AnimalRef;
      retryable?: boolean;
      // Offer a way out of the error besides retrying (quota / members-only -> Membership).
      action?: "membership";
    };

export type Chat = {
  id: string;
  // Who the dropdown currently points at -- new messages go to this animal, but past
  // "animal" messages carry their own `animal` so switching mid-chat doesn't relabel history.
  animal: AnimalRef;
  // Chatroom mode (1.3): 2-4 animals who all react to each message, in turn. `animal` stays the
  // first of them so everything that expects one animal keeps working.
  room?: AnimalRef[];
  title: string;
  messages: ChatMessage[];
  createdAt: number;
};

const STORAGE_KEY = "aineko.chats.v1";
// Builds 1.0 (1)-(9) stored history under the pre-rename key. Moved over once on first load so
// existing TestFlight installs keep their chats; safe to delete once every install has opened
// a build newer than (9).
const LEGACY_STORAGE_KEY = "catgpt.chats.v1";

// Local-only for now: there's no account system, so history lives in this browser/app
// install and doesn't sync across devices. Fine for a prototype; worth a real backend
// once chats need to survive a reinstall or move between devices.
export function loadChats(): Chat[] {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        localStorage.setItem(STORAGE_KEY, raw);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(migrateAnimals) : [];
  } catch {
    return [];
  }
}

// Builds 1.0 (1)-(12) stored species ids ("cat"); characters replaced them (2026-09-23). Rewritten
// on load, so the rest of the app only ever sees character ids.
function migrateAnimals(chat: Chat): Chat {
  const fix = (id: unknown): AnimalRef => normalizeAnimalId(id) ?? ANIMALS[0]!.id;
  const room = chat.room?.map((id) => normalizeAnimalId(id)).filter((id): id is AnimalRef => id !== null);
  return {
    ...chat,
    ...(room && room.length >= 2 ? { room } : { room: undefined }),
    animal: fix(chat.animal),
    messages: (chat.messages ?? []).map((m) =>
      m.role === "animal" || (m.role === "error" && m.animal) ? { ...m, animal: fix(m.animal) } : m,
    ),
  };
}

export function saveChats(chats: Chat[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    // best-effort; a full storage quota or private-mode block shouldn't crash the app
  }
}

export function newChat(animal: AnimalRef): Chat {
  return {
    id: newId(),
    animal,
    title: "New chat",
    messages: [],
    createdAt: Date.now(),
  };
}

export function titleFromFirstMessage(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}...` : trimmed;
}

// Most recently used first, like every other chat app -- continuing an old chat moves it up.
export function moveToFront(chats: Chat[], id: string): Chat[] {
  const chat = chats.find((c) => c.id === id);
  return chat ? [chat, ...chats.filter((c) => c.id !== id)] : chats;
}
