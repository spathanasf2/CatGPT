"use client";

import { animalById } from "@/lib/animals";
import type { Chat } from "@/lib/chats";

type Props = {
  open: boolean;
  chats: Chat[];
  activeChatId: string | null;
  onClose: () => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onOpenSettings: () => void;
};

export function Sidebar({
  open,
  chats,
  activeChatId,
  onClose,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onOpenSettings,
}: Props) {
  return (
    <>
      {open && <div className="backdrop" onClick={onClose} />}
      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="sidebar-title">Aineko</div>
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={onNewChat}>
            <span>+</span> New chat
          </button>
        </div>
        <div className="chat-list">
          {chats.length === 0 && <p className="chat-list-empty">No chats yet.</p>}
          {chats.map((c) => {
            const meta = animalById(c.animal);
            return (
              <button
                key={c.id}
                className={`chat-item${c.id === activeChatId ? " active" : ""}`}
                onClick={() => onSelectChat(c.id)}
              >
                <span className="chat-item-emoji">{meta.emoji}</span>
                <span className="chat-item-title">{c.title}</span>
                <span
                  className="chat-item-delete"
                  role="button"
                  aria-label="Delete chat"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat(c.id);
                  }}
                >
                  &times;
                </span>
              </button>
            );
          })}
        </div>
        <button className="settings-btn" onClick={onOpenSettings}>
          Settings
        </button>
      </aside>
    </>
  );
}
