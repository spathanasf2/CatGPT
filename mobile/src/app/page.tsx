"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ANIMALS, animalById, normalizeAnimalId, type AnimalRef } from "@/lib/animals";
import { askAnimal, toHistory, ChatError, type ChatErrorKind, type HistoryItem } from "@/lib/chat";
import {
  loadChats,
  saveChats,
  newChat,
  moveToFront,
  titleFromFirstMessage,
  type Chat,
  type ChatMessage,
} from "@/lib/chats";
import { useViewportHeight } from "@/lib/use-viewport-height";
import { newId } from "@/lib/ids";
import { grantConsent, loadConsent, revokeConsent } from "@/lib/consent";
import { refreshMembership } from "@/lib/membership";
import { forgetAnimal, memoriesFor, rememberFor } from "@/lib/memory";
import { bondFor, bondNote, forgetBonds, setBond } from "@/lib/bond";
import {
  cancelNudge,
  disableNudges,
  enableNudges,
  nudgesAvailable,
  nudgesOn,
  onNudgeTapped,
  scheduleNudge,
} from "@/lib/nudges";
import { replyHaptic } from "@/lib/haptics";
import { renderShareCard } from "@/lib/share-card";
import { sharePng } from "@/lib/share";
import { deleteCustomAnimal, loadCustomAnimals, saveCustomAnimal, type CustomAnimal } from "@/lib/custom-animals";
import { Sidebar } from "@/components/Sidebar";
import { SettingsModal } from "@/components/SettingsModal";
import { UsageModal } from "@/components/UsageModal";
import { MembershipModal } from "@/components/MembershipModal";
import { BootScreen } from "@/components/BootScreen";
import { ConsentModal } from "@/components/ConsentModal";
import { MemoriesModal } from "@/components/MemoriesModal";
import { CreateAnimalModal } from "@/components/CreateAnimalModal";
import { YourAnimalsModal } from "@/components/YourAnimalsModal";
import { AnimalPicker, CREATE_ANIMAL } from "@/components/AnimalPicker";
import { Avatar } from "@/components/Avatar";

const DEFAULT_ANIMAL: AnimalRef = ANIMALS[0]!.id;

// Framed as suggestions ("try saying hi"), not literal messages -- the label is what's shown,
// `message` is what actually gets sent when tapped, since the two shouldn't always be the same
// string once the label is written as an instruction rather than an example.
const STARTER_PROMPTS: { label: string; message: string }[] = [
  { label: "say hi", message: "Hi!" },
  { label: "ask how their day was", message: "How was your day?" },
  { label: "give them a nickname", message: "I'm going to call you Waffles." },
  { label: "tell them a secret", message: "Don't tell anyone, but..." },
];

// The app should never land on a dead "pick a chat" screen. If there's still an untouched
// draft (zero user messages -- e.g. from a previous cold open nobody typed into), reuse it
// instead of piling up empty chats in the sidebar; otherwise start a fresh one. The draft isn't
// necessarily first -- continuing an older chat moves that chat above it -- so it's searched for
// and moved back to the top.
function ensureDraft(list: Chat[]): { chats: Chat[]; activeId: string } {
  const draft = list.find((c) => !c.messages.some((m) => m.role === "user"));
  if (draft) {
    return { chats: moveToFront(list, draft.id), activeId: draft.id };
  }
  const chat = newChat(DEFAULT_ANIMAL);
  return { chats: [chat, ...list], activeId: chat.id };
}

// The animal of the most recent chat you actually said something in (chats are most-recent-first).
function lastTalkedTo(chats: Chat[]): AnimalRef | null {
  const chat = chats.find((c) => c.messages.some((m) => m.role === "user"));
  return chat ? chat.animal : null;
}

// Named animals go first ("Koba, sit!"), the rest in a fresh random order each turn.
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function turnOrder(room: AnimalRef[], text: string): AnimalRef[] {
  const lower = text.toLowerCase();
  const mentions = (a: AnimalRef) => new RegExp(`\\b${escapeRegExp(animalById(a).name.toLowerCase())}\\b`).test(lower);
  const named = room.filter(mentions);
  const rest = room.filter((a) => !named.includes(a));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return [...named, ...rest];
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// Phrased as a stage direction like every other animal line. The raw error is for the console,
// not for the person chatting.
function errorMessage(err: unknown, animal: AnimalRef): ChatMessage {
  console.warn("chat request failed", err);
  const name = animalById(animal).name;
  const kind: ChatErrorKind = err instanceof ChatError ? err.kind : "unavailable";
  const quota = err instanceof ChatError ? err.quota : undefined;
  const period = quota?.window === "monthly" ? "month" : "week";
  const copy: Record<ChatErrorKind, string> = {
    offline: `*${name} can't hear you.* Check your connection and try again.`,
    timeout: `*${name} wandered off mid-thought.* Try again?`,
    "rate-limited": `*${name} needs a breather.* You're sending messages faster than ${name} can keep up -- give it a minute.`,
    // "About 10x" mirrors FREE_FRACTION=0.1 in server/src/limits.ts.
    quota: !quota
      ? `*${name} is all talked out.* You've hit the chat limit for now.`
      : quota.tier === "free"
        ? `*${name} is all talked out.* You've used this ${period}'s free chats -- they come back ${formatDay(quota.resetAt)}. Members get about 10\u00d7 more.`
        : `*${name} is all talked out.* You've used this ${period}'s chats -- they come back ${formatDay(quota.resetAt)}.`,
    "members-only": `*${name} only talks to members.* Bonus animals come with a membership.`,
    unavailable: `*${name} didn't answer.* Something went wrong on our end -- try again in a bit.`,
  };
  const offerMembership = kind === "members-only" || (kind === "quota" && quota?.tier !== "member");
  return {
    id: newId(),
    role: "error",
    text: copy[kind],
    animal,
    retryable: kind !== "quota" && kind !== "members-only",
    ...(offerMembership ? { action: "membership" as const } : {}),
  };
}

export default function Home() {
  useViewportHeight();

  const [hydrated, setHydrated] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [showMembership, setShowMembership] = useState(false);
  const [showMemories, setShowMemories] = useState(false);
  const [showYourAnimals, setShowYourAnimals] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  // The animal being edited, "new" for a fresh one, or null when the editor is closed.
  const [editingAnimal, setEditingAnimal] = useState<CustomAnimal | "new" | null>(null);
  const [customAnimals, setCustomAnimals] = useState<CustomAnimal[]>([]);
  const [nudges, setNudges] = useState(false);
  // For listeners registered once (app backgrounding, notification taps) that need current chats.
  const chatsRef = useRef<Chat[]>([]);
  chatsRef.current = chats;
  // "ask" on first launch (or on a send without permission), "review" from Settings.
  const [consentMode, setConsentMode] = useState<"ask" | "review" | null>(null);
  const [consentedAt, setConsentedAt] = useState<string | null>(null);
  // A message someone tried to send before giving permission -- sent once they allow it.
  const sendAfterConsent = useRef<string | null>(null);
  const [member, setMember] = useState(false);
  const [input, setInput] = useState("");
  // Chats currently awaiting a reply, and which animal is doing the thinking. Per chat, so a
  // pending reply in one chat doesn't show its thinking bubble in (or lock the composer of)
  // whichever chat you switch to meanwhile.
  const [pending, setPending] = useState<Record<string, AnimalRef>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const { chats: initial, activeId } = ensureDraft(loadChats());
    setChats(initial);
    setActiveChatId(activeId);
    setConsentedAt(loadConsent());
    setCustomAnimals(loadCustomAnimals());
    setNudges(nudgesOn());
    setHydrated(true);
  }, []);

  // StoreKit is the source of truth for membership. Re-read on returning to the foreground too: a
  // renewal issues a new signed transaction, and the old one stops verifying once it expires.
  useEffect(() => {
    const refresh = () => {
      refreshMembership()
        .then(setMember)
        .catch(() => undefined);
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // "Misses you" nudges: scheduled as the app goes to the background, from whoever you talked to
  // last; cancelled when it comes back. Tapping one opens a chat with that animal.
  useEffect(() => {
    if (!nudgesAvailable()) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        cancelNudge().catch(() => undefined);
        return;
      }
      const last = lastTalkedTo(chatsRef.current);
      if (last) scheduleNudge(animalById(last), memoriesFor(last)).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisibility);
    const stopTaps = onNudgeTapped((id) => {
      const animal = normalizeAnimalId(id);
      if (!animal) return;
      const { chats: next, activeId } = ensureDraft(chatsRef.current);
      setChats(next.map((c) => (c.id === activeId ? { ...c, animal } : c)));
      setActiveChatId(activeId);
    });
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopTaps();
    };
  }, []);

  async function handleToggleNudges() {
    if (nudges) {
      await disableNudges();
      setNudges(false);
      return;
    }
    const granted = await enableNudges();
    if (!granted) window.alert("Notifications for Aineko are turned off in iOS Settings.");
    setNudges(granted);
  }

  function handlePreviewNudge() {
    const last = lastTalkedTo(chatsRef.current) ?? DEFAULT_ANIMAL;
    scheduleNudge(animalById(last), memoriesFor(last), new Date(Date.now() + 5_000), true).catch(() => undefined);
  }

  // First launch: ask for AI permission as the boot screen clears (see ConsentModal).
  useEffect(() => {
    if (hydrated && bootDone && !loadConsent()) setConsentMode("ask");
  }, [hydrated, bootDone]);

  // Matches BootScreen's own on-screen duration -- kept as a separate timer (not tied to
  // `hydrated`, which typically resolves almost instantly) so the two can be intentionally
  // decoupled: this is what the keyboard-focus effect below waits on, so the keyboard comes up
  // in unison with the chat UI instead of racing up underneath the still-visible boot screen.
  useEffect(() => {
    const t = setTimeout(() => setBootDone(true), 1100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (hydrated) saveChats(chats);
  }, [chats, hydrated]);

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;
  const activePending = activeChat ? pending[activeChat.id] : undefined;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [activeChat?.messages, activePending]);

  // Best-effort only: iOS only shows the on-screen keyboard for a .focus() call made
  // *synchronously* inside a real user gesture (tap). This fires with no gesture behind it, so
  // it moves DOM focus (a ready blinking cursor) but on a true cold launch won't reliably pop
  // the keyboard itself -- that's a WebKit restriction with no native workaround on iOS
  // (Capacitor's Keyboard.show() is Android-only). Gated on `bootDone`, not just `hydrated`
  // (which resolves almost instantly): firing this the moment data loads focused the input
  // while the boot screen was still covering it, popping the keyboard mid-loading-animation
  // instead of in unison with the chat UI actually appearing.
  // (Skipped while the first-launch permission sheet is up -- allowing it focuses from its tap.)
  useEffect(() => {
    if (hydrated && bootDone && loadConsent()) inputRef.current?.focus();
  }, [hydrated, bootDone]);

  // iOS only shows the on-screen keyboard for a .focus() call made *synchronously* inside a real
  // user gesture (tap) -- one that runs after React's normal async re-render (e.g. a useEffect
  // keyed on activeChat.id) is too late: the DOM focus still moves (confirmed with
  // document.activeElement) but the keyboard itself won't appear, since by then we're outside
  // the gesture's call stack as far as WebKit is concerned. flushSync forces the state update and
  // DOM commit to happen synchronously, right here in the click handler, so the input actually
  // exists by the time we call .focus() and we're still inside the tap.
  function focusComposerNow() {
    inputRef.current?.focus();
  }

  function handleNewChat() {
    const { chats: next, activeId } = ensureDraft(chats);
    flushSync(() => {
      setChats(next);
      setActiveChatId(activeId);
      setSidebarOpen(false);
    });
    focusComposerNow();
  }

  function handleSelectChat(id: string) {
    flushSync(() => {
      setActiveChatId(id);
      setSidebarOpen(false);
    });
    focusComposerNow();
  }

  function handleDeleteChat(id: string) {
    const filtered = chats.filter((c) => c.id !== id);
    if (activeChatId !== id) {
      setChats(filtered);
      return;
    }
    const { chats: next, activeId } = ensureDraft(filtered);
    setChats(next);
    setActiveChatId(activeId);
  }

  function handleClearChats() {
    const { chats: next, activeId } = ensureDraft([]);
    setChats(next);
    setActiveChatId(activeId);
  }

  // Picking one animal also ends a room -- the chat goes back to one-on-one.
  function handleAnimalChange(animal: AnimalRef) {
    if (!activeChat) return;
    const id = activeChat.id;
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, animal, room: undefined } : c)));
  }

  function handleStartRoom(room: AnimalRef[]) {
    setShowPicker(false);
    if (!activeChat || room.length < 2) return;
    const id = activeChat.id;
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, animal: room[0]!, room } : c)));
  }

  function appendMessage(chatId: string, message: ChatMessage) {
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, messages: [...c.messages, message] } : c)));
  }

  // Called from the sheet's button tap, so focusing here (after a synchronous commit) still counts
  // as inside the gesture and brings the keyboard up -- same reasoning as focusComposerNow.
  function handleAllowConsent() {
    setConsentedAt(grantConsent());
    if (consentMode !== "ask") return;
    const queued = sendAfterConsent.current;
    sendAfterConsent.current = null;
    flushSync(() => setConsentMode(null));
    focusComposerNow();
    if (queued) void handleSend(queued);
  }

  function handleDeclineConsent() {
    sendAfterConsent.current = null;
    setConsentMode(null);
  }

  function handleRevokeConsent() {
    revokeConsent();
    setConsentedAt(null);
  }

  function handleAnimalPick(animal: AnimalRef | typeof CREATE_ANIMAL) {
    setShowPicker(false);
    if (animal === CREATE_ANIMAL) {
      if (member) setEditingAnimal("new");
      else setShowMembership(true);
      return;
    }
    if (animalById(animal).membersOnly && !member) {
      setShowMembership(true);
      return;
    }
    handleAnimalChange(animal);
  }

  // A brand-new animal becomes who the current chat is talking to, and the keyboard comes up --
  // this runs inside the Save tap, so focusing still counts as part of the gesture (see
  // focusComposerNow).
  function handleSaveAnimal(animal: CustomAnimal) {
    const isNew = editingAnimal === "new";
    saveCustomAnimal(animal);
    flushSync(() => {
      setCustomAnimals(loadCustomAnimals());
      setEditingAnimal(null);
      if (isNew) {
        setShowYourAnimals(false);
        handleAnimalChange(animal.id);
      }
    });
    if (isNew) focusComposerNow();
  }

  // A reply as an image card for the share sheet, with the message it was answering. Cancelling the
  // share sheet rejects too, so failures here are logged and otherwise ignored.
  async function handleShare(messageIndex: number) {
    if (!activeChat) return;
    const reply = activeChat.messages[messageIndex];
    if (reply?.role !== "animal") return;
    let said: string | undefined;
    for (let i = messageIndex - 1; i >= 0; i--) {
      const m = activeChat.messages[i]!;
      if (m.role === "user") {
        said = m.text;
        break;
      }
    }
    const animal = animalById(reply.animal);
    try {
      const png = await renderShareCard({ animal, sounds: reply.sounds, narrative: reply.narrative, said });
      await sharePng(
        png,
        `aineko-${animal.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}.png`,
        `${animal.name} on Aineko`,
      );
    } catch (err) {
      console.warn("share failed or was cancelled", err);
    }
  }

  // Soft delete: past messages from it still render. Chats pointed at it fall back to the default.
  function handleDeleteAnimal(animal: CustomAnimal) {
    deleteCustomAnimal(animal.id);
    forgetAnimal(animal.id);
    forgetBonds(animal.id);
    setCustomAnimals(loadCustomAnimals());
    setChats((prev) =>
      prev.map((c) => {
        if (c.room?.includes(animal.id)) {
          // Out of the room; a room of one is just a chat again.
          const room = c.room.filter((a) => a !== animal.id);
          return room.length >= 2 ? { ...c, room, animal: room[0]! } : { ...c, room: undefined, animal: room[0] ?? DEFAULT_ANIMAL };
        }
        return c.animal === animal.id ? { ...c, animal: DEFAULT_ANIMAL } : c;
      }),
    );
  }

  // One animal's reply, appended to the chat and returned (null on error -- the error bubble is
  // appended instead). In a room, `keepPending` holds the composer locked between animals.
  async function requestReply(
    chatId: string,
    animal: AnimalRef,
    text: string,
    history: HistoryItem[],
    opts: { roomMates?: AnimalRef[]; keepPending?: boolean } = {},
  ): Promise<ChatMessage | null> {
    setPending((prev) => ({ ...prev, [chatId]: animal }));
    try {
      const before = bondFor(animal);
      const reply = await askAnimal(animal, text, history, memoriesFor(animal), before, opts.roomMates);
      replyHaptic();
      if (reply.remember) rememberFor(animal, reply.remember);
      if (reply.bond !== undefined) setBond(animal, reply.bond);
      const note = reply.bond !== undefined ? bondNote(animalById(animal).name, before, reply.bond) : null;
      const message: ChatMessage = {
        id: newId(),
        role: "animal",
        animal,
        sounds: reply.sounds,
        narrative: reply.narrative,
        ...(reply.remember ? { remembered: reply.remember } : {}),
        ...(note ? { bondNote: note } : {}),
      };
      appendMessage(chatId, message);
      return message;
    } catch (err) {
      appendMessage(chatId, errorMessage(err, animal));
      return null;
    } finally {
      if (!opts.keepPending) {
        setPending((prev) => {
          const next = { ...prev };
          delete next[chatId];
          return next;
        });
      }
    }
  }

  // Chatroom turn: every animal reacts in turn, each seeing what the ones before it just did (their
  // replies go into its history). Whoever the message names goes first; the rest are shuffled, so
  // the same animal doesn't always get the last word. One failing doesn't stop the others.
  async function roomTurn(chatId: string, room: AnimalRef[], text: string, before: ChatMessage[]) {
    let seen = before;
    const order = turnOrder(room, text);
    for (let k = 0; k < order.length; k++) {
      const animal = order[k]!;
      const reply = await requestReply(chatId, animal, text, toHistory(seen), {
        roomMates: room.filter((a) => a !== animal),
        keepPending: k < order.length - 1,
      });
      if (reply) seen = [...seen, reply];
    }
  }

  async function handleSend(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || !activeChat || pending[activeChat.id]) return;
    if (!loadConsent()) {
      sendAfterConsent.current = text;
      setConsentMode("ask");
      return;
    }
    const chatId = activeChat.id;
    const animal = activeChat.animal;
    const room = activeChat.room;
    const earlier = activeChat.messages;
    const isFirstUserMessage = !activeChat.messages.some((m) => m.role === "user");
    const history = toHistory(activeChat.messages);
    setInput("");
    setChats((prev) =>
      moveToFront(
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                title: isFirstUserMessage ? titleFromFirstMessage(text) : c.title,
                messages: [...c.messages, { id: newId(), role: "user", text }],
              }
            : c,
        ),
        chatId,
      ),
    );
    if (room?.length) await roomTurn(chatId, room, text, earlier);
    else await requestReply(chatId, animal, text, history);
  }

  // Re-asks the user message the error was answering, in place: the error bubble goes away and the
  // reply lands where it would have originally. Only offered on a chat's last message, so a late
  // reply can never land out of order.
  function handleRetry(errorId: string) {
    if (!activeChat || pending[activeChat.id]) return;
    const messages = activeChat.messages;
    const errorIndex = messages.findIndex((m) => m.id === errorId);
    const error = messages[errorIndex];
    // (Not findLastIndex -- that's iOS 15.4+, and the deployment target is 15.0.)
    let userIndex = errorIndex - 1;
    while (userIndex >= 0 && messages[userIndex]?.role !== "user") userIndex--;
    const question = messages[userIndex];
    if (error?.role !== "error" || question?.role !== "user") return;
    const chatId = activeChat.id;
    const animal = error.animal ?? activeChat.animal;
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== errorId) } : c)),
    );
    void requestReply(chatId, animal, question.text, toHistory(messages.slice(0, userIndex)), {
      roomMates: activeChat.room?.filter((a) => a !== animal),
    });
  }

  const currentAnimal = activeChat ? animalById(activeChat.animal) : null;

  return (
    <div className="shell" style={{ ["--accent" as string]: currentAnimal?.accent ?? "#c98bd8" }}>
      <BootScreen hidden={bootDone} />
      <Sidebar
        open={sidebarOpen}
        chats={chats}
        activeChatId={activeChatId}
        onClose={() => setSidebarOpen(false)}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        onOpenSettings={() => setShowSettings(true)}
      />

      <main className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
            &#9776;
          </button>
          {activeChat && currentAnimal ? (
            <button className="animal-button" onClick={() => setShowPicker(true)} aria-label="Choose an animal">
              {activeChat.room?.length ? (
                <span className="avatar-stack">
                  {activeChat.room.map((a) => (
                    <Avatar key={a} animal={animalById(a)} size={28} />
                  ))}
                </span>
              ) : (
                <Avatar animal={currentAnimal} size={28} />
              )}
              <span>{activeChat.room?.length ? "Room" : currentAnimal.name}</span>
              <span className="animal-button-chevron" aria-hidden>
                {"\u25BE"}
              </span>
            </button>
          ) : (
            <span className="topbar-title">Aineko</span>
          )}
        </header>

        {activeChat ? (
          <>
            <div className="messages" ref={scrollRef}>
              {activeChat.messages.map((m, i) => {
                if (m.role === "user") {
                  return (
                    <div key={m.id} className="row user">
                      <div className="bubble user">{m.text}</div>
                    </div>
                  );
                }
                if (m.role === "error") {
                  const canRetry = m.retryable !== false && !activePending && i === activeChat.messages.length - 1;
                  return (
                    <div key={m.id} className="row animal">
                      <div className="bubble error">
                        {m.text}
                        {canRetry && (
                          <button
                            className="retry-btn"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleRetry(m.id)}
                          >
                            Try again
                          </button>
                        )}
                        {m.action === "membership" && !member && (
                          <button
                            className="error-action-btn"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setShowMembership(true)}
                          >
                            See membership
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }
                const speaker = animalById(m.animal);
                return (
                  <div key={m.id} className="row animal">
                    <Avatar animal={speaker} size={30} className="row-avatar" />
                    <div className="bubble animal" style={{ ["--accent" as string]: speaker.accent }}>
                      <div className="sounds">{m.sounds}</div>
                      <div className="narrative">{m.narrative}</div>
                      {m.remembered && (
                        <div className="remembered">
                          {"\u{1F4AD}"} {speaker.name} will remember: {m.remembered}
                        </div>
                      )}
                      {m.bondNote && (
                        <div className={`bond-note${m.bondNote.warmer ? " warmer" : ""}`}>
                          {m.bondNote.warmer ? "\u{1F49B}" : "\u{1F494}"} {m.bondNote.text}
                        </div>
                      )}
                      <button
                        className="share-btn"
                        aria-label={`Share ${speaker.name}'s reply`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleShare(i)}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                          <path
                            d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
              {activePending && (
                <div className="row animal">
                  <Avatar animal={animalById(activePending)} size={30} className="row-avatar" />
                  <div className="bubble animal" style={{ ["--accent" as string]: animalById(activePending).accent }}>
                    <div className="thinking">
                      <span>{animalById(activePending).thinking}</span>
                      <span className="dots">
                        <span />
                        <span />
                        <span />
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {!activeChat.messages.some((m) => m.role === "user") && (
              <div className="starter-chips">
                {STARTER_PROMPTS.map((p) => (
                  <button
                    key={p.label}
                    className="starter-chip"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSend(p.message)}
                    disabled={!!activePending}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}

            <div className="composer">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // Enter also confirms a Japanese/Chinese/Korean IME candidate -- that one must not
                  // send. Safari reports it as keyCode 229 rather than via isComposing.
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) handleSend();
                }}
                placeholder={activeChat.room?.length ? "say something to the room..." : `say something to ${currentAnimal?.name}...`}
                enterKeyHint="send"
              />
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSend()}
                disabled={!!activePending || !input.trim()}
              >
                Send
              </button>
            </div>
          </>
        ) : (
          // Should be unreachable in practice -- ensureDraft() keeps a chat active at all
          // times post-hydration, and BootScreen covers the brief pre-hydration window.
          <div className="empty-state" />
        )}
      </main>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onClearChats={handleClearChats}
          onOpenUsage={() => {
            setShowSettings(false);
            setShowUsage(true);
          }}
          onOpenMembership={() => {
            setShowSettings(false);
            setShowMembership(true);
          }}
          onOpenPrivacy={() => {
            setShowSettings(false);
            setConsentMode("review");
          }}
          onOpenMemories={() => {
            setShowSettings(false);
            setShowMemories(true);
          }}
          onOpenYourAnimals={() => {
            setShowSettings(false);
            setShowYourAnimals(true);
          }}
          nudges={nudgesAvailable() ? nudges : null}
          onToggleNudges={handleToggleNudges}
          onPreviewNudge={handlePreviewNudge}
        />
      )}
      {showUsage && (
        <UsageModal
          onClose={() => setShowUsage(false)}
          onOpenMembership={() => {
            setShowUsage(false);
            setShowMembership(true);
          }}
        />
      )}
      {showMemories && <MemoriesModal onClose={() => setShowMemories(false)} />}
      {showYourAnimals && (
        <YourAnimalsModal
          animals={customAnimals}
          member={member}
          onCreate={() => setEditingAnimal("new")}
          onEdit={(a) => setEditingAnimal(a)}
          onDelete={handleDeleteAnimal}
          onOpenMembership={() => {
            setShowYourAnimals(false);
            setShowMembership(true);
          }}
          onClose={() => setShowYourAnimals(false)}
        />
      )}
      {showPicker && activeChat && (
        <AnimalPicker
          current={activeChat.animal}
          room={activeChat.room}
          customAnimals={customAnimals}
          member={member}
          onPick={handleAnimalPick}
          onStartRoom={handleStartRoom}
          onNeedMembership={() => {
            setShowPicker(false);
            setShowMembership(true);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
      {editingAnimal && (
        <CreateAnimalModal
          initial={editingAnimal === "new" ? null : editingAnimal}
          onSave={handleSaveAnimal}
          onClose={() => setEditingAnimal(null)}
        />
      )}
      {showMembership && <MembershipModal onClose={() => setShowMembership(false)} onMembershipChange={setMember} />}
      {consentMode && (
        <ConsentModal
          mode={consentMode}
          consentedAt={consentedAt}
          onAllow={handleAllowConsent}
          onRevoke={handleRevokeConsent}
          onClose={consentMode === "ask" ? handleDeclineConsent : () => setConsentMode(null)}
        />
      )}
    </div>
  );
}
