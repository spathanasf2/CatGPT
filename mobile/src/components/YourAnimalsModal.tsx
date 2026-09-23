"use client";

import { speciesOption, type CustomAnimal } from "@/lib/custom-animals";

type Props = {
  animals: CustomAnimal[];
  member: boolean;
  onCreate: () => void;
  onEdit: (animal: CustomAnimal) => void;
  onDelete: (animal: CustomAnimal) => void;
  onOpenMembership: () => void;
  onClose: () => void;
};

// Settings > Your animals: the ones this person made, with edit and delete.
export function YourAnimalsModal({ animals, member, onCreate, onEdit, onDelete, onOpenMembership, onClose }: Props) {
  const live = animals.filter((a) => !a.deleted);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Your animals</h2>
        {live.length === 0 && (
          <p className="modal-text">Pick a species, a name, and a personality, and they&apos;re yours to talk to.</p>
        )}
        {live.map((a) => (
          <div key={a.id} className="your-animal">
            <span className="your-animal-name">
              {speciesOption(a.species).emoji} {a.name}
            </span>
            <button className="link-btn" onClick={() => onEdit(a)}>
              Edit
            </button>
            <button
              className="link-btn danger"
              onClick={() => {
                if (window.confirm(`Say goodbye to ${a.name}? Old chats with ${a.name} stay.`)) onDelete(a);
              }}
            >
              Delete
            </button>
          </div>
        ))}
        {member ? (
          <button className="subscribe-btn" onClick={onCreate}>
            Make an animal
          </button>
        ) : (
          <button className="settings-row-btn" onClick={onOpenMembership}>
            Making your own animals comes with a membership &rsaquo;
          </button>
        )}
        <button className="modal-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
