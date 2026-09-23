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

  const speciesLabel = SPECIES_OPTIONS.find((o) => o.id === species)?.label;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal create-animal" onClick={(e) => e.stopPropagation()}>
        <h2>{initial ? `Edit ${initial.name}` : "Make an animal"}</h2>
        {/* Sized to fit a phone screen without scrolling; scrolls vertically only as a fallback
            (small phones, keyboard up). Sideways is locked: iOS otherwise let the sheet drift
            left/right, since slider knobs at the ends overhang the track slightly. */}
        <div className="create-body">
          <input
            className="create-name"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            autoCapitalize="words"
            aria-label="Name"
          />
          {trimmed && !nameOk && <p className="create-hint">Letters, numbers, spaces, and &apos; . - only.</p>}

          <p className="create-label">
            Species <span className="create-value">{speciesLabel}</span>
          </p>
          <div className="species-row">
            {SPECIES_OPTIONS.map((o) => (
              <button
                key={o.id}
                className={`species-btn${species === o.id ? " on" : ""}`}
                aria-label={o.label}
                onClick={() => setSpecies(o.id)}
              >
                {o.emoji}
              </button>
            ))}
          </div>

          <div className="create-inline">
            <p className="create-label">Pronoun</p>
            <div className="chip-row compact">
              {(["she", "he", "it"] as const).map((pr) => (
                <button key={pr} className={`chip${pronoun === pr ? " on" : ""}`} onClick={() => setPronoun(pr)}>
                  {pr}
                </button>
              ))}
            </div>
          </div>

          {SLIDERS.map((sl) => (
            <div key={sl.key} className="slider">
              <p className="create-label">
                {sl.label} <span className="create-value">{sl.steps[levels[sl.key] + 2]}</span>
              </p>
              <input
                type="range"
                min={-2}
                max={2}
                step={1}
                value={levels[sl.key]}
                aria-label={sl.label}
                onChange={(e) => setLevels((l) => ({ ...l, [sl.key]: Number(e.target.value) as Level }))}
              />
            </div>
          ))}

          <p className="create-label">
            Quirks <span className="create-value">up to {MAX_QUIRKS}</span>
          </p>
          <div className="chip-row compact">
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
        <div className="create-actions">
          <button className="modal-close-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="subscribe-btn" onClick={save} disabled={!nameOk}>
            {initial ? "Save" : `Say hi to ${trimmed || "them"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
