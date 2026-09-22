import { test } from "node:test";
import assert from "node:assert/strict";
import { kidSafe } from "../src/kid-safe.ts";

test("swaps nicker in every form, keeping case", () => {
  assert.equal(kidSafe("Nicker!"), "Whinny!");
  assert.equal(kidSafe("NICKER NICKER"), "WHINNY WHINNY");
  assert.equal(kidSafe("*nickers softly, then nickered again while nickering*"), "*whinnies softly, then whinnied again while whinnying*");
});

test("swaps the other listed words", () => {
  assert.equal(kidSafe("*the pussycat yawns*"), "*the kitty yawns*");
  assert.equal(kidSafe("Pussycats everywhere"), "Kitties everywhere");
  assert.equal(kidSafe("*lowers its horny head*"), "*lowers its horned head*");
});

test("leaves ordinary words alone", () => {
  const safe = "*snickers, picks up a knickknack, and neighs at the pussywillow-free yard*";
  assert.equal(kidSafe(safe), safe);
});
