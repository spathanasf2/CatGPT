"use client";

import { useState } from "react";
import { ANIMALS, type AnimalMeta, type AnimalRef } from "@/lib/animals";
import { customMeta, type CustomAnimal } from "@/lib/custom-animals";
import { allBonds, bondLevel } from "@/lib/bond";
import { Avatar } from "./Avatar";

export const CREATE_ANIMAL = "__create__";
export const ROOM_MIN = 2;
export const ROOM_MAX = 4;

type Props = {
  current: AnimalRef;
  // The chat's room, if it is one -- the picker then opens in Room mode with them selected.
  room?: AnimalRef[];
  customAnimals: CustomAnimal[];
  member: boolean;
  onPick: (id: AnimalRef | typeof CREATE_ANIMAL) => void;
  onStartRoom: (room: AnimalRef[]) => void;
  onNeedMembership: () => void;
  onClose: () => void;
};

// Who you're talking to. Replaced iOS's native <select> (2026-09-23), which can only show text --
// the portraits needed somewhere to live. Members-only animals sit below a thin divider with a
// plain label rather than individual lock badges (Frank: clear what's new, not "special"); picking
// one without a membership opens Membership, same as before.
//
// Room mode (1.3): pick 2-4 animals who all react to each message.
export function AnimalPicker({ current, room, customAnimals, member, onPick, onStartRoom, onNeedMembership, onClose }: Props) {
  const [mode, setMode] = useState<"one" | "room">(room?.length ? "room" : "one");
  const [selected, setSelected] = useState<AnimalRef[]>(room ?? [current]);
  const mine = customAnimals.filter((a) => !a.deleted).map(customMeta);
  const bonds = allBonds();

  function tap(a: AnimalMeta) {
    if (mode === "one") return onPick(a.id);
    if (a.membersOnly && !member) return onNeedMembership();
    setSelected((s) => (s.includes(a.id) ? s.filter((x) => x !== a.id) : s.length < ROOM_MAX ? [...s, a.id] : s));
  }

  const tile = (a: AnimalMeta) => {
    const on = mode === "one" ? a.id === current : selected.includes(a.id);
    return (
      <button key={a.id} className={`pick-tile${on ? " on" : ""}`} style={{ ["--accent" as string]: a.accent }} onClick={() => tap(a)}>
        <span className="pick-avatar">
          <Avatar animal={a} size={56} />
          {mode === "room" && on && <span className="pick-check">{"✓"}</span>}
        </span>
        <span className="pick-name">{a.name}</span>
        <span className="pick-species">
          {a.species}
          {bonds[a.id] !== undefined ? ` · ${bondLevel(bonds[a.id]!)}` : ""}
        </span>
      </button>
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <h2>{mode === "one" ? "Who are you talking to?" : "Who's in the room?"}</h2>
          <div className="picker-modes" role="tablist">
            <button className={mode === "one" ? "on" : ""} onClick={() => setMode("one")} role="tab" aria-selected={mode === "one"}>
              One animal
            </button>
            <button className={mode === "room" ? "on" : ""} onClick={() => setMode("room")} role="tab" aria-selected={mode === "room"}>
              Room
            </button>
          </div>
        </div>
        <div className="picker-scroll">
          <div className="pick-grid">{ANIMALS.filter((a) => !a.membersOnly).map(tile)}</div>
          <p className="pick-section">Members only</p>
          <div className="pick-grid">{ANIMALS.filter((a) => a.membersOnly).map(tile)}</div>
          {(mode === "one" || mine.length > 0) && <p className="pick-section">Your animals</p>}
          <div className="pick-grid">
            {mine.map(tile)}
            {mode === "one" && (
              <button className="pick-tile make" onClick={() => onPick(CREATE_ANIMAL)}>
                <span className="pick-plus">+</span>
                <span className="pick-name">Make your own</span>
              </button>
            )}
          </div>
        </div>
        {mode === "room" && (
          <button
            className="subscribe-btn room-start"
            disabled={selected.length < ROOM_MIN}
            onClick={() => onStartRoom(selected)}
          >
            {selected.length < ROOM_MIN
              ? `Pick ${ROOM_MIN}–${ROOM_MAX} animals`
              : `${room?.length ? "Update" : "Start"} room with ${selected.length}`}
          </button>
        )}
      </div>
    </div>
  );
}
