import { test } from "node:test";
import assert from "node:assert/strict";
import { applyBondDelta, bondLevel, currentBond, parseBond } from "../src/bond.ts";
import { ANIMALS } from "../src/animals.ts";

test("scores move at most 2 per exchange and stay within -10..10", () => {
  assert.equal(applyBondDelta(0, 5), 2);
  assert.equal(applyBondDelta(0, -7), -2);
  assert.equal(applyBondDelta(9, 2), 10);
  assert.equal(applyBondDelta(-10, -1), -10);
  assert.equal(applyBondDelta(3, "lots"), 3);
  assert.equal(applyBondDelta(3, 1.6), 5);
});

test("first meeting uses the character's start; Kevin has no feelings", () => {
  assert.equal(currentBond(ANIMALS.mortimer, null), -4);
  assert.equal(currentBond(ANIMALS.koba, null), 7);
  assert.equal(currentBond(ANIMALS.koba, -3), -3);
  assert.equal(currentBond(ANIMALS.kevin, 5), null);
});

test("levels and request validation", () => {
  assert.deepEqual([-8, -3, 0, 4, 8].map(bondLevel), ["hostile", "wary", "undecided", "fond", "devoted"]);
  assert.equal(parseBond(undefined), undefined);
  assert.equal(parseBond(null), null);
  assert.equal(parseBond(4), 4);
  for (const bad of [11, -11, 2.5, "4", {}]) assert.equal(parseBond(bad), "invalid");
});

test("promise field: absent, none open, open, or malformed", async () => {
  const { parsePromise } = await import("../src/history.ts");
  assert.equal(parsePromise(undefined), undefined);
  assert.equal(parsePromise(null), null);
  assert.equal(parsePromise("  a walk after dinner "), "a walk after dinner");
  assert.equal(parsePromise("x".repeat(150))?.length, 80);
  for (const bad of ["", "   ", 5, {}, "y".repeat(201)]) assert.equal(parsePromise(bad), "invalid");
});
