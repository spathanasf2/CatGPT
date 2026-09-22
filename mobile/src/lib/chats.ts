import type { AnimalId } from "./animals";

export type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "animal"; animal: AnimalId; sounds: string; narrative: string }
  | { id: string; role: "error"; text: string };

export type Chat = {
  id: string;
  // Who the dropdown currently points at -- new messages go to this animal, but past
  // "animal" messages carry their own `animal` so switching mid-chat doesn't relabel history.
  animal: AnimalId;
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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveChats(chats: Chat[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    // best-effort; a full storage quota or private-mode block shouldn't crash the app
  }
}

export function newChat(animal: AnimalId): Chat {
  return {
    id: crypto.randomUUID(),
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
