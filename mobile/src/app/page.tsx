"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ANIMALS, animalById, type AnimalId } from "@/lib/animals";
import { askAnimal } from "@/lib/chat";
import { loadChats, saveChats, newChat, titleFromFirstMessage, type Chat, type ChatMessage } from "@/lib/chats";
import { useViewportHeight } from "@/lib/use-viewport-height";
import { Sidebar } from "@/components/Sidebar";
import { SettingsModal } from "@/components/SettingsModal";
import { UsageModal } from "@/components/UsageModal";
import { MembershipModal } from "@/components/MembershipModal";
import { BootScreen } from "@/components/BootScreen";

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

// The app should never land on a dead "pick a chat" screen. If the most recent chat is
// still an untouched draft (zero user messages -- e.g. from a previous cold open nobody
// typed into), reuse it instead of piling up empty chats in the sidebar; otherwise start
// a fresh one. Chats are always prepended on creation, so a draft, if one exists, is
// always at index 0.
function ensureDraft(list: Chat[]): { chats: Chat[]; activeId: string } {
  const mostRecent = list[0];
  if (mostRecent && !mostRecent.messages.some((m) => m.role === "user")) {
    return { chats: list, activeId: mostRecent.id };
  }
  const chat = newChat(DEFAULT_ANIMAL);
  return { chats: [chat, ...list], activeId: chat.id };
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
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const { chats: initial, activeId } = ensureDraft(loadChats());
    setChats(initial);
    setActiveChatId(activeId);
    setHydrated(true);
  }, []);

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [activeChat?.messages, sending]);

  // Best-effort only: iOS only shows the on-screen keyboard for a .focus() call made
  // *synchronously* inside a real user gesture (tap). This fires with no gesture behind it, so
  // it moves DOM focus (a ready blinking cursor) but on a true cold launch won't reliably pop
  // the keyboard itself -- that's a WebKit restriction with no native workaround on iOS
  // (Capacitor's Keyboard.show() is Android-only). Gated on `bootDone`, not just `hydrated`
  // (which resolves almost instantly): firing this the moment data loads focused the input
  // while the boot screen was still covering it, popping the keyboard mid-loading-animation
  // instead of in unison with the chat UI actually appearing.
  useEffect(() => {
    if (hydrated && bootDone) inputRef.current?.focus();
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

  async function handleSend(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || sending || !activeChat) return;
    const chatId = activeChat.id;
    const animal = activeChat.animal;
    const isFirstUserMessage = !activeChat.messages.some((m) => m.role === "user");
    setInput("");
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              title: isFirstUserMessage ? titleFromFirstMessage(text) : c.title,
              messages: [...c.messages, { id: crypto.randomUUID(), role: "user", text }],
            }
          : c,
      ),
    );
    setSending(true);
    try {
      const reply = await askAnimal(animal, text);
      appendMessage(chatId, { id: crypto.randomUUID(), role: "animal", animal, ...reply });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "something went wrong";
      appendMessage(chatId, { id: crypto.randomUUID(), role: "error", text: msg });
    } finally {
      setSending(false);
    }
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
              onChange={(e) => handleAnimalChange(e.target.value as AnimalId)}
            >
              {ANIMALS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.emoji} {a.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="topbar-title">Aineko</span>
          )}
        </header>

        {activeChat ? (
          <>
            <div className="messages" ref={scrollRef}>
              {activeChat.messages.map((m) => {
                if (m.role === "user") {
                  return (
                    <div key={m.id} className="row user">
                      <div className="bubble user">{m.text}</div>
                    </div>
                  );
                }
                if (m.role === "error") {
                  return (
                    <div key={m.id} className="row animal">
                      <div className="bubble error">{m.text}</div>
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
              {sending && currentAnimal && (
                <div className="row animal">
                  <div className="bubble animal">
                    <div className="thinking">
                      <span>{currentAnimal.emoji}</span>
                      <span>{currentAnimal.thinking}</span>
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
                    disabled={sending}
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
                  if (e.key === "Enter") handleSend();
                }}
                placeholder={`say something to the ${currentAnimal?.label.toLowerCase()}...`}
                enterKeyHint="send"
              />
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSend()}
                disabled={sending || !input.trim()}
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
        />
      )}
      {showUsage && <UsageModal onClose={() => setShowUsage(false)} />}
      {showMembership && <MembershipModal onClose={() => setShowMembership(false)} />}
    </div>
  );
}
