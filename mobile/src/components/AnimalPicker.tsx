"use client";

import { ANIMALS, type AnimalRef } from "@/lib/animals";
import { customMeta, type CustomAnimal } from "@/lib/custom-animals";
import { allBonds, bondLevel } from "@/lib/bond";
import { Avatar } from "./Avatar";

export const CREATE_ANIMAL = "__create__";

type Props = {
  current: AnimalRef;
  customAnimals: CustomAnimal[];
  onPick: (id: AnimalRef | typeof CREATE_ANIMAL) => void;
  onClose: () => void;
};

// Who you're talking to. Replaced iOS's native <select> (2026-09-23), which can only show text --
// the portraits needed somewhere to live. Members-only animals sit below a thin divider with a
// plain label rather than individual lock badges (Frank: clear what's new, not "special"); picking
// one without a membership opens Membership, same as before.
export function AnimalPicker({ current, customAnimals, onPick, onClose }: Props) {
  const mine = customAnimals.filter((a) => !a.deleted).map(customMeta);
  const bonds = allBonds();
  const tile = (a: (typeof ANIMALS)[number]) => (
    <button key={a.id} className={`pick-tile${a.id === current ? " on" : ""}`} style={{ ["--accent" as string]: a.accent }} onClick={() => onPick(a.id)}>
      <Avatar animal={a} size={56} />
      <span className="pick-name">{a.name}</span>
      <span className="pick-species">
        {a.species}
        {bonds[a.id] !== undefined ? ` \u00b7 ${bondLevel(bonds[a.id]!)}` : ""}
      </span>
    </button>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal picker" onClick={(e) => e.stopPropagation()}>
        <h2>Who are you talking to?</h2>
        <div className="picker-scroll">
          <div className="pick-grid">{ANIMALS.filter((a) => !a.membersOnly).map(tile)}</div>
          <p className="pick-section">Members only</p>
          <div className="pick-grid">{ANIMALS.filter((a) => a.membersOnly).map(tile)}</div>
          <p className="pick-section">Your animals</p>
          <div className="pick-grid">
            {mine.map(tile)}
            <button className="pick-tile make" onClick={() => onPick(CREATE_ANIMAL)}>
              <span className="pick-plus">+</span>
              <span className="pick-name">Make your own</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
