# Aineko roadmap / ideas

Brain-dump from 2026-09-21, sorted into rough version buckets. Nothing here is built yet except
what's marked (done). Sequencing is a suggestion, not a commitment -- reorder freely.

## v0.1 (shipped)
- Single shared thread, one animal at a time via a picker. Transcript persisted across animal
  switches -- an accidental first taste of "everyone's in the room."
- Keyboard fix, attempt 1 (2026-09-21): `visualViewport` height fed into a CSS var. Incomplete --
  see v0.1.1.

## v0.1.1 (shipped) -- ChatGPT/Claude-style shell
- Left sidebar (mobile drawer, not a permanent column -- matches how the actual iOS ChatGPT/Claude
  apps do it, since this app lives on a phone): new chat, chat history, settings, collapses behind
  a hamburger.
- "New chat" now means picking one animal to start a conversation with (a persona, same mental
  model as picking a custom GPT); the sidebar list is one row per past chat. Each chat opens with
  a random tip/update line front-loaded at the top of the transcript.
- ~~Model dropdown in the top bar~~ -- **superseded in v0.1.2**, this was a misread: see below.
- Chat history stored in `localStorage` for now -- local to one browser/app install, not synced
  across devices or reinstalls. Fine for a prototype; would need a real backend + accounts to
  survive a reinstall.

## v0.1.2 (shipped) -- animal dropdown, more animals, usage counting
- Corrected v0.1.1's dropdown: it was built as an LLM-model picker, but "model" meant *chat
  partner*, not backend engine. The dropdown now switches which **animal** answers next, in the
  same chat -- no separate "new chat" step to change who you're talking to. New chats preselect a
  default animal and drop you straight into typing. Each past animal message keeps its own
  `animal` field, so switching mid-chat doesn't relabel history -- this is the "everyone's in the
  room" feeling from v0.1, now built on purpose instead of as an accident of shared state.
- The backend model is fully invisible to the client again, as originally intended -- no
  `GET /models` call from the app, no model string anywhere in the UI. `server/src/models.ts`
  still exists, but purely as an ops/testing concern: it's the automatic fallback order `askAnimal`
  tries through if a call errors, which is exactly what would have recovered automatically from
  the free-model failure on 2026-09-21 had it been in place already. Default is
  `google/gemini-2.5-flash-lite`, falling back through `openai/gpt-4.1-nano` and
  `meta-llama/llama-3.1-8b-instruct` in order; verified by forcing a dead model id and confirming
  it silently recovers on the next candidate.
- Added parrot (mimics fragments of what it just heard, badly -- the one animal allowed to use
  human words, since that's its whole gimmick) and fish (near-silent, reacts to almost nothing --
  the joke pushed to its most extreme). Six animals total.
- Real usage counting: OpenRouter's per-request `usage` (requested via `usage: {include: true}`
  for accurate cross-provider accounting) is persisted server-side (`server/usage.json`) and
  exposed at `GET /usage`; Settings > Usage shows tokens used against a placeholder 100k-token
  budget (`USAGE_TOKEN_BUDGET`). This proves the counting is accurate -- actual budgets/limits are
  a separate decision for later.
- Keyboard fix, attempt 2 (2026-09-21): attempt 1 only tracked `visualViewport.height`. The actual
  bug was iOS Safari *panning* the visual viewport away from the fixed layout viewport to reveal
  the focused input (`visualViewport.offsetTop`), which attempt 1 didn't account for -- so the top
  of the page could end up further out of view, not less. The shell now tracks both `height` and
  `offsetTop` and repositions itself (`top` + `height`) to exactly cover whatever region iOS
  currently considers visible, which should cancel the pan out rather than just resize around it.
  **Not verified on a real device yet** -- worth another pass on your phone before calling it done.

## v0.2 candidate: confirmed, not yet built
Frank said yes to these on 2026-09-21 -- they're accepted, just not scheduled against the config
and chatroom work below yet.

1. **Shareable moments.** A "share this reply" button that renders the sounds+narrative bubble as
   an image card, à la qoracle's `share.ts`/`saved-rolls.ts` pattern. This is a joke app -- the
   whole point is a screenshot of "BORK BORK BORK *grabs leash, stares at you, shaking*" landing in
   a group chat. That's the actual growth loop, more than any in-app feature.
2. **Sound + motion, not just text.** It's literally onomatopoeia -- a short bark/meow audio clip
   and a CSS bounce/shake on the bubble when a reply lands would multiply the payoff for near-zero
   engineering cost. Capacitor Haptics is already a proven dependency from qoracle.
3. **More animals** -- partially done in v0.1.2 (parrot, fish; six total now). Horse, goat, and
   snake shipped 2026-09-22 as members-only bonus animals (build 1.0 (10)). Slots into the v0.3 config-as-data work below directly -- a new animal becomes a
   new JSON file, not a code change.

## v0.3 candidate: config as data, not code
Right now animal personality/vocab/accent color lives twice, hardcoded: `server/src/animals.ts`
and `mobile/src/lib/animals.ts`. That's already worth fixing on its own (single source of truth),
and it's the natural place to hang the keyword-trigger idea.

Proposed shape, mirroring cli-games' `text_control/` pattern (hand-edited JSON, a sync script
generates the runtime data, `codegen:check`-style drift guard in CI):

```
text_control/animals/dog.json
text_control/animals/cat.json
text_control/animals/cow.json
text_control/animals/duck.json
```

Each file, roughly:
```json
{
  "id": "dog",
  "label": "Dog",
  "emoji": "🐶",
  "accent": "#e0a94c",
  "personality": "Boundlessly eager, loyal, zero impulse control...",
  "vocabulary": ["Bork", "Woof", "Arf", "Whine", "Growl", "Awoo"],
  "moods": {
    "happy":  { "triggers": ["walk", "treat", "outside", "ride", "park", "good boy", "good girl"] },
    "afraid": { "triggers": ["vet", "bath", "thunder", "no", "bad dog"] },
    "alert":  { "triggers": ["door", "mail", "cat", "squirrel"] }
  }
}
```
`npm run sync-animals` generates `src/data/animals.generated.ts` (or `.json`), consumed by both
`server` and `mobile`. Frank edits the JSON directly for small tweaks (new trigger word, tone
adjustment, a whole new animal) without needing a Claude session for it.

**Open design question -- how triggers should actually affect the reply**, two options, not
mutually exclusive:
1. **Deterministic override**: an exact keyword hit skips the LLM and returns a canned
   sounds+narrative pair for that mood. Zero latency, zero cost, perfectly on-brand every time --
   but repeats itself and feels scripted once you've seen the good lines.
2. **Prompt hint**: detected trigger words get annotated into the system/user prompt ("the human
   said 'walk' -- dogs usually read this as an invitation") so the LLM leans into the reaction but
   still generates fresh phrasing every time. Costs a normal request, stays varied, but the model
   can occasionally ignore the hint.

Leaning toward (2) as the default with a small hand-picked set of (1) for the two or three
"greatest hits" reactions per animal (e.g. dog always loses its mind at "walk") -- gets the
guaranteed laugh on the obvious inputs while staying fresh everywhere else. Worth prototyping both
and comparing before committing.

## v0.4 candidate: chatroom mode
The multi-animal idea: build a roster (e.g. two dogs, a cat, a parrot), send one message to the
room, get back a sequence of reactions -- including animals reacting to *each other*, not just to
you. Frank's example: "alright everybody get in your cage" -> dog1 hides, dog2 stares, cat is
about to pounce on the parrot, parrot shrieks "CAGE".

Rough shape:
- Roster needs per-instance identity, not just species -- "dog1" and "dog2" are both dogs but need
  distinct names/quirks so they don't produce identical output. Config file per roster member:
  `{ animalId: "dog", name: "Biscuit", quirk: "always agrees with whoever spoke last" }`.
- Turn order: call the model once per roster member, per user message, feeding each call the
  transcript *plus* the reactions already generated earlier in this same turn -- so animal 3 can
  reference what animal 1 and 2 just did. Sequential, not parallel, for that reason.
- Cost/latency scales with roster size (N animals = N calls per message). Fine on a cheap model,
  but worth a "the room is reacting..." staged reveal in the UI rather than waiting for all N to
  land before showing anything.
- Comedic ceiling is really about giving each roster member a *quirk* beyond species -- otherwise
  two dogs just say the same thing twice. Quirks belong in the same config file as the
  species-level personality/vocabulary (v0.3), just layered per-instance.
- Needs its own UI: roster builder (add/remove/rename members), transcript with sender labels
  instead of just "the animal", maybe a max roster size (3-4) so it stays a chat, not a wall of text.

## Other ideas raised, not yet bucketed
- Feed trigger-word detection results into the `/chat` response so the client can react visually
  (e.g. flash the dog's picker pill) even before deciding how much it affects generation.
- Rate-limit/cost guard once `OPENROUTER_MODEL` points at a paid model and chatroom mode multiplies
  request count.

## Ideas from Claude, still speculative (not yet accepted)
Ranked by how much they extend novelty rather than just adding surface area:

1. **Per-animal state that persists across a session** (an affection/mood meter that drifts based
   on how you talk to it) turns "type something, get a noise" into something with a tiny arc --
   the cat warming up to you, or the dog getting more frantic the longer you ignore its walk
   requests. This is what buys time after the first-five-minutes novelty of "haha it barks."
2. **A light goal to chase**: "get the cat to purr" or "get the dog to fall asleep" as a soft
   mini-game layered on chatroom/mood state, rather than a pure toy with no win condition.
3. Collectible/unlockable *rarer* animals, layered on top of the plain "more animals" ask above --
   taps completionism instead of relying on the joke alone to carry repeat visits.
