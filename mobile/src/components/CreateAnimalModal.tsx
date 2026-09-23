"use client";

import { useState } from "react";
import {
  MAX_QUIRKS,
  NAME_PATTERN,
  QUIRKS,
  SLIDERS,
  SPECIES_OPTIONS,
  newCustomId,
  pickAccent,
  type CustomAnimal,
  type Level,
  type SliderKey,
  type SpeciesId,
} from "@/lib/custom-animals";

type Props = {
  // Editing an existing animal, or null to make a new one.
  initial: CustomAnimal | null;
  onSave: (animal: CustomAnimal) => void;
  onClose: () => void;
};

// A menu, not a prompt box: species, name, pronoun, four sliders, up to two quirks. The server
// turns these into the personality (server/src/custom.ts), so nothing typed here but the name
// ever reaches the model.
export function CreateAnimalModal({ initial, onSave, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [species, setSpecies] = useState<SpeciesId>(initial?.species ?? "dog");
  const [pronoun, setPronoun] = useState<CustomAnimal["pronoun"]>(initial?.pronoun ?? "she");
  const [levels, setLevels] = useState<Record<SliderKey, Level>>({
    energy: initial?.energy ?? 0,
    friendliness: initial?.friendliness ?? 0,
    appetite: initial?.appetite ?? 0,
    drama: initial?.drama ?? 0,
  });
  const [quirks, setQuirks] = useState<string[]>(initial?.quirks ?? []);
  const trimmed = name.trim();
  const nameOk = NAME_PATTERN.test(trimmed);

  function toggleQuirk(id: string) {
    setQuirks((q) => (q.includes(id) ? q.filter((x) => x !== id) : q.length < MAX_QUIRKS ? [...q, id] : q));
  }

  function save() {
    if (!nameOk) return;
    const id = initial?.id ?? newCustomId();
    onSave({
      id,
      name: trimmed,
      species,
      pronoun,
      quirks,
      ...levels,
      accent: initial?.accent ?? pickAccent(id),
      createdAt: initial?.createdAt ?? Date.now(),
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal create-animal" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? `Edit ${initial.name}` : "Make an animal"}</h2>
        <div className="create-scroll">
          <p className="modal-row-label">Name</p>
          <input
            className="create-name"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            placeholder="Biscuit"
            autoCapitalize="words"
          />
          {trimmed && !nameOk && <p className="create-hint">Letters, numbers, spaces, and &apos; . - only.</p>}

          <p className="modal-row-label">Species</p>
          <div className="chip-row">
            {SPECIES_OPTIONS.map((s) => (
              <button key={s.id} className={`chip${species === s.id ? " on" : ""}`} onClick={() => setSpecies(s.id)}>
                {s.emoji} {s.label}
              </button>
            ))}
          </div>

          <p className="modal-row-label">Pronoun</p>
          <div className="chip-row">
            {(["she", "he", "it"] as const).map((p) => (
              <button key={p} className={`chip${pronoun === p ? " on" : ""}`} onClick={() => setPronoun(p)}>
                {p}
              </button>
            ))}
          </div>

          {SLIDERS.map((s) => (
            <div key={s.key} className="slider">
              <p className="modal-row-label">
                {s.label}: <span className="slider-value">{s.steps[levels[s.key] + 2]}</span>
              </p>
              <input
                type="range"
                min={-2}
                max={2}
                step={1}
                value={levels[s.key]}
                onChange={(e) => setLevels((l) => ({ ...l, [s.key]: Number(e.target.value) as Level }))}
              />
              <div className="slider-ends">
                <span>{s.steps[0]}</span>
                <span>{s.steps[4]}</span>
              </div>
            </div>
          ))}

          <p className="modal-row-label">Quirks (up to {MAX_QUIRKS})</p>
          <div className="chip-row">
            {QUIRKS.map((q) => (
              <button
                key={q.id}
                className={`chip${quirks.includes(q.id) ? " on" : ""}`}
                disabled={!quirks.includes(q.id) && quirks.length >= MAX_QUIRKS}
                onClick={() => toggleQuirk(q.id)}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
        <button className="subscribe-btn" onClick={save} disabled={!nameOk}>
          {initial ? "Save" : `Say hi to ${trimmed || "them"}`}
        </button>
        <button className="modal-close-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
