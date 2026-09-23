"use client";

import { useState } from "react";
import { ANIMALS, animalById, type AnimalRef } from "@/lib/animals";
import { customById, isCustomId } from "@/lib/custom-animals";
import { allMemories, forgetAll, MEMORY_LIMIT } from "@/lib/memory";
import { allBonds, bondLevel, forgetBonds, LEVEL_LABEL } from "@/lib/bond";
import { Avatar } from "./Avatar";

type Props = {
  onClose: () => void;
};

// Settings > What they remember: every note each animal is holding onto, in its own words, and a
// way to wipe them. Transparency for something that shapes replies, and half the fun is reading it.
export function MemoriesModal({ onClose }: Props) {
  const [memories, setMemories] = useState(() => allMemories());
  const [bonds, setBonds] = useState(() => allBonds());
  // Built-ins in roster order, then the person's own animals (skipping deleted ones). This used to
  // list ANIMALS only, so custom animals' notes were saved but never shown.
  // Anyone who remembers something or has feelings about you (i.e. you've talked).
  const ids = [
    ...new Set([...Object.keys(memories).filter((id) => memories[id as AnimalRef]?.length), ...Object.keys(bonds)]),
  ] as AnimalRef[];
  const builtIn = ANIMALS.filter((a) => ids.includes(a.id)).map((a) => a.id);
  const custom = ids.filter((id) => isCustomId(id) && customById(id) && !customById(id)!.deleted);
  const withNotes = [...builtIn, ...custom].map((id) => animalById(id));

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
                <p className="modal-row-label memory-who">
                  <Avatar animal={a} size={20} /> {a.name}
                  {bonds[a.id] !== undefined && <span className="memory-feeling">{LEVEL_LABEL[bondLevel(bonds[a.id]!)]}</span>}
                </p>
                {!!memories[a.id]?.length && (
                  <ul className="memory-list">
                    {memories[a.id]!.map((n) => (
                      <li key={n.at}>{n.text}</li>
                    ))}
                  </ul>
                )}
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
              if (window.confirm("Make every animal forget everything, feelings included? This can't be undone.")) {
                forgetAll();
                forgetBonds();
                setMemories({});
                setBonds({});
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
