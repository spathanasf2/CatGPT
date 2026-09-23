import { test } from "node:test";
import assert from "node:assert/strict";
import { isKnownNote } from "../src/memory-notes.ts";

// Real notes the model produced while already holding the memory it was restating (2026-09-23).
test("rewordings of an existing memory are duplicates", () => {
  const koba = ["the human promised a walk after dinner and never took me"];
  for (const note of [
    "the walk was promised after dinner",
    "the human promised a walk and never took me",
    "Human promised a walk and never took me.",
    "I remember the walk that was promised",
    "The human promised a walk and didn't take me",
  ]) {
    assert.equal(isKnownNote(note, koba, "Koba"), true, note);
  }
  assert.equal(isKnownNote("Tank remembers the plastic bag.", ["a plastic bag attacked me by the fence"], "Tank"), true);
  assert.equal(isKnownNote("The human promised bread tomorrow.", ["the human owes me bread tomorrow"], "Gerald"), true);
  assert.equal(isKnownNote("The in-laws have invaded and I will not stand for it.", ["the in-laws invaded for a whole week"], "Mortimer"), true);
});

test("genuinely new memories are kept", () => {
  assert.equal(isKnownNote("The human mentioned a ride.", ["a plastic bag attacked me by the fence"], "Tank"), false);
  assert.equal(isKnownNote("the vet is on friday", ["the in-laws invaded for a whole week"], "Mortimer"), false);
  assert.equal(isKnownNote("dinner was late again", [], "Hayley"), false);
  assert.equal(isKnownNote("dinner was early for once", ["dinner was late last night"], "Hayley"), false);
});
