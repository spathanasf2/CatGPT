// Live check of memory behavior (costs a few cents of API calls): seeds a memory, asks a neutral
// next-day question N times per character, counts replies that visibly act on it and new notes that
// slipped past the duplicate check. Baseline 2026-09-23 after tuning: ~15/20 callbacks, and 0/20
// invented notes in ordinary chat. Re-run after editing the memory prompt:
//   cd server && set -a && . ./.env && set +a && \
//   USAGE_FILE=/tmp/u.json TOKEN_BUDGET_FILE=/tmp/b.json node --import tsx/esm scripts/memory-callbacks.mts
import { askAnimal } from "../src/openrouter.ts";
import { ANIMALS } from "../src/animals.ts";
const cases: [string, string[], string, RegExp][] = [
  ["koba", ["the human promised a walk after dinner and never took me"], "Morning Koba! What do you want to do today?", /walk|promis|door|leash/i],
  ["hayley", ["dinner was late last night"], "I'm home!", /late|last night|yesterday|again|still/i],
  ["mortimer", ["the in-laws invaded for a whole week"], "Good morning, Mortimer", /in-law|guest|visitor|intrud|invad|week|stranger/i],
  ["tank", ["a plastic bag attacked me by the fence"], "Want to go for a ride?", /bag|fence/i],
];
const N = 5;
for (const [id, memory, msg, hit] of cases) {
  let hits = 0, notes = 0;
  for (let i = 0; i < N; i++) {
    const r = await askAnimal(ANIMALS[id as keyof typeof ANIMALS], msg, { budgetKeys: ["ab"], memory });
    if (hit.test(`${r.sounds} ${r.narrative}`)) hits++;
    if (id === "hayley" || id === "mortimer") console.log(`      ${id}: ${r.narrative}`);
    if (r.remember) { notes++; console.log(`      note: ${r.remember}`); }
  }
  console.log(`${id.padEnd(9)} callbacks ${hits}/${N}   spurious new notes ${notes}/${N}`);
}
process.exit(0);
