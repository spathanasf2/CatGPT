"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ANIMALS, animalById, type AnimalId } from "@/lib/animals";
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
import { Sidebar } from "@/components/Sidebar";
import { SettingsModal } from "@/components/SettingsModal";
import { UsageModal } from "@/components/UsageModal";
import { MembershipModal } from "@/components/MembershipModal";
import { BootScreen } from "@/components/BootScreen";
import { ConsentModal } from "@/components/ConsentModal";

const DEFAULT_ANIMAL: AnimalId = ANIMALS[0]!.id;

// Framed as suggestions ("try saying hi"), not literal messages -- the label is what's shown,
// `message` is what actually gets sent when tapped, since the two shouldn't always be the same
// string once the label is written as an instruction rather than an example.
const STARTER_PROMPTS: { label: string; message: string }[] = [
  { label: "say hi", message: "Hi!" },
  { label: "ask how their day was", message: "How was your day?" },
  { label: "give them a name", message: "I'm going to call you Waffles." },
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

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// Phrased as a stage direction like every other animal line. The raw error is for the console,
// not for the person chatting.
function errorMessage(err: unknown, animal: AnimalId): ChatMessage {
  console.warn("chat request failed", err);
  const label = animalById(animal).label.toLowerCase();
  const kind: ChatErrorKind = err instanceof ChatError ? err.kind : "unavailable";
  const quota = err instanceof ChatError ? err.quota : undefined;
  const period = quota?.window === "monthly" ? "month" : "week";
  const copy: Record<ChatErrorKind, string> = {
    offline: `*the ${label} can't hear you.* Check your connection and try again.`,
    timeout: `*the ${label} wandered off mid-thought.* Try again?`,
    "rate-limited": `*the ${label} needs a breather.* You're sending messages faster than it can keep up -- give it a minute.`,
    // "About 10x" mirrors FREE_FRACTION=0.1 in server/src/limits.ts.
    quota: !quota
      ? `*the ${label} is all talked out.* You've hit the chat limit for now.`
      : quota.tier === "free"
        ? `*the ${label} is all talked out.* You've used this ${period}'s free chats -- they come back ${formatDay(quota.resetAt)}. Members get about 10\u00d7 more.`
        : `*the ${label} is all talked out.* You've used this ${period}'s chats -- they come back ${formatDay(quota.resetAt)}.`,
    "members-only": `*the ${label} only talks to members.* Bonus animals come with a membership.`,
    unavailable: `*the ${label} didn't answer.* Something went wrong on our end -- try again in a bit.`,
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
  const [pending, setPending] = useState<Record<string, AnimalId>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const { chats: initial, activeId } = ensureDraft(loadChats());
    setChats(initial);
    setActiveChatId(activeId);
    setConsentedAt(loadConsent());
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

  function handleAnimalChange(animal: AnimalId) {
    if (!activeChat) return;
    const id = activeChat.id;
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, animal } : c)));
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

  function handleAnimalPick(animal: AnimalId) {
    if (animalById(animal).membersOnly && !member) {
      setShowMembership(true);
      return;
    }
    handleAnimalChange(animal);
  }

  async function requestReply(chatId: string, animal: AnimalId, text: string, history: HistoryItem[]) {
    setPending((prev) => ({ ...prev, [chatId]: animal }));
    try {
      const reply = await askAnimal(animal, text, history);
      appendMessage(chatId, { id: newId(), role: "animal", animal, ...reply });
    } catch (err) {
      appendMessage(chatId, errorMessage(err, animal));
    } finally {
      setPending((prev) => {
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
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
    await requestReply(chatId, animal, text, history);
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
    void requestReply(chatId, animal, question.text, toHistory(messages.slice(0, userIndex)));
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
          {activeChat ? (
            <select
              className="animal-select"
              value={activeChat.animal}
              onChange={(e) => handleAnimalPick(e.target.value as AnimalId)}
            >
              {ANIMALS.filter((a) => !a.membersOnly).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.emoji} {a.label}
                </option>
              ))}
              {/* Bonus animals grouped under their own header (a section break in iOS's native
                  picker) rather than individually badged -- Frank: clear what's new, not "special". */}
              <optgroup label="Members only">
                {ANIMALS.filter((a) => a.membersOnly).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.emoji} {a.label}
                  </option>
                ))}
              </optgroup>
            </select>
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
                    <div className="bubble animal" style={{ ["--accent" as string]: speaker.accent }}>
                      <div className="sounds">
                        {speaker.emoji} {m.sounds}
                      </div>
                      <div className="narrative">{m.narrative}</div>
                    </div>
                  </div>
                );
              })}
              {activePending && (
                <div className="row animal">
                  <div className="bubble animal" style={{ ["--accent" as string]: animalById(activePending).accent }}>
                    <div className="thinking">
                      <span>{animalById(activePending).emoji}</span>
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
                placeholder={`say something to the ${currentAnimal?.label.toLowerCase()}...`}
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
