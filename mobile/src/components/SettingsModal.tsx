"use client";

type Props = {
  onClose: () => void;
  onClearChats: () => void;
  onOpenUsage: () => void;
  onOpenMembership: () => void;
  onOpenPrivacy: () => void;
  onOpenMemories: () => void;
  onOpenYourAnimals: () => void;
};

export function SettingsModal({
  onClose,
  onClearChats,
  onOpenUsage,
  onOpenMembership,
  onOpenPrivacy,
  onOpenMemories,
  onOpenYourAnimals,
}: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <button className="settings-row-btn" onClick={onOpenMembership}>
          Membership
        </button>
        <button className="settings-row-btn" onClick={onOpenUsage}>
          Usage
        </button>
        <button className="settings-row-btn" onClick={onOpenYourAnimals}>
          Your animals
        </button>
        <button className="settings-row-btn" onClick={onOpenMemories}>
          What they remember
        </button>
        <button className="settings-row-btn" onClick={onOpenPrivacy}>
          AI &amp; privacy
        </button>
        <button
          className="danger-btn"
          onClick={() => {
            if (window.confirm("Clear all chat history? This can't be undone.")) {
              onClearChats();
              onClose();
            }
          }}
        >
          Clear all chats
        </button>
        <button className="modal-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
