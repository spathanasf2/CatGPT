"use client";

import { useState } from "react";
import { ANIMALS } from "@/lib/animals";
import { allMemories, forgetAll, MEMORY_LIMIT } from "@/lib/memory";

type Props = {
  onClose: () => void;
};

// Settings > What they remember: every note each animal is holding onto, in its own words, and a
// way to wipe them. Transparency for something that shapes replies, and half the fun is reading it.
export function MemoriesModal({ onClose }: Props) {
  const [memories, setMemories] = useState(() => allMemories());
  const withNotes = ANIMALS.filter((a) => memories[a.id]?.length);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>What they remember</h2>
        {withNotes.length === 0 ? (
          <p className="modal-text">Nobody remembers anything yet. Give it time.</p>
        ) : (
          <div className="memory-scroll">
            {withNotes.map((a) => (
              <div key={a.id} className="memory-group">
                <p className="modal-row-label">
                  {a.emoji} {a.name}
                </p>
                <ul className="memory-list">
                  {memories[a.id]!.map((n) => (
                    <li key={n.at}>{n.text}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <p className="fine-print">
          Kept on this device only. Each animal holds onto its latest {MEMORY_LIMIT} things.
        </p>
        {withNotes.length > 0 && (
          <button
            className="danger-btn"
            onClick={() => {
              if (window.confirm("Make every animal forget everything? This can't be undone.")) {
                forgetAll();
                setMemories({});
              }
            }}
          >
            Forget everything
          </button>
        )}
        <button className="modal-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
