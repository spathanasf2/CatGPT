# Aineko

## Concept
A chatbot app where you talk to animals instead of an AI. They understand the gist (and pick out
a few trigger words like "walk" or "treat") but can only reply in real onomatopoeia. Every reply
has two layers: `sounds` (the literal noise, e.g. "BORK BORK BORK") and `narrative` (a one-line
`*action*` stage direction describing what the animal is doing and what it thinks it heard). The
joke is the mismatch between what you said and what comes back.

Destined for the iOS App Store, piggybacking on the Mac/Xcode/Apple ID groundwork already set up
for `~/qoracle` (see `[[project-mac-workflow]]` in qoracle's memory). Same architecture split as
qoracle: a static Next.js client wrapped later in Capacitor, plus a tiny server that holds the
API key so it's never shipped in the client bundle.

## Layout
- `server/` — Express + TypeScript. Holds the OpenRouter key.
  `POST /chat {animal, message, history?, model?}` -> `{sounds, narrative}` (`history` = the last
  few user/animal turns, see "Conversation memory" below; `model` is an internal/ops override, never
  sent by the app — see below); `GET /models` and `GET /usage` (app-wide token totals) are the same kind of internal/ops surface
  -- builds (1)-(9) showed `/usage` in Settings > Usage; build (10)+ calls `GET /usage/me` (the
  caller's own allowance) instead. Animal roster + system prompt in `src/animals.ts` / `src/openrouter.ts`;
  the model list in `src/models.ts` doubles as the automatic-fallback order (see below); token
  counting in `src/usage.ts`.
- `mobile/` — Next.js (App Router), `output: "export"` static site. ChatGPT/Claude-style shell:
  collapsible sidebar (`src/components/Sidebar.tsx`, chat history + new chat + settings), main
  pane with a per-chat **animal** dropdown (`src/app/page.tsx`) — this is a chat-partner switcher,
  not a model picker; the LLM behind it is never exposed to the client. "New chat" preselects a
  default animal and drops you straight into typing; the dropdown changes who answers *next*, and
  each past animal message keeps its own `animal` field so switching mid-chat doesn't relabel
  history — one chat can feel like addressing a room of different animals over time. State
  persisted to `localStorage` (`src/lib/chats.ts`, key `aineko.chats.v1`, migrated once from the
  pre-rename `catgpt.chats.v1`) — local to one browser/install, not synced.
  Settings > Usage (`src/components/UsageModal.tsx`) shows cumulative token counts against a
  placeholder budget. Capacitor iOS scaffold added 2026-09-21 (`ios/`, `capacitor.config.ts`,
  `appId: "com.commandminelabs.aineko"`) — see Shipping to the App Store below for status.

**The backend model is entirely invisible to the client and never user-selectable — by design.**
Frank picks the model (`src/models.ts`), not the end user. The client only ever sends an animal id
and a message; `askAnimal` picks the model itself, trying `OPENROUTER_MODEL` (or `MODELS[0]` if
unset) first and automatically falling through the rest of `MODELS` in order if a call errors —
this is what recovered automatically when the free model that was live for testing started
failing on 2026-09-21. Changing the model list, default, or fallback order is a `server/.env` or
`src/models.ts` edit + `systemctl --user restart aineko-server`; no client rebuild or App Store
review involved, because the client never knew which model it was talking to in the first place.

## Running it
- Server dev: `cd server && npm run dev` (reads `.env` via `--env-file`).
- Server prod: `npm run build` then `npm start`, or just use the systemd unit (below).
- Mobile dev: `cd mobile && npm run dev` (reads `.env.local`).
- Mobile static export: `npm run build` -> `out/`.

## Secrets
- `server/.env` (gitignored): `AUTH_TOKEN` (shared secret with the mobile client, already
  generated), `OPENROUTER_API_KEY` (**paste your OpenRouter key here** —
  https://openrouter.ai/keys — then `systemctl --user restart aineko-server`), `OPENROUTER_MODEL`
  (which model is tried first; unset falls back to `MODELS[0]` in `src/models.ts` — either way,
  the rest of `MODELS` is the automatic fallback order if the first one errors). OpenRouter's
  lineup moves fast — if you get "No endpoints found for `<model>`", the id was retired; check
  https://openrouter.ai/models for a current one. `USAGE_TOKEN_BUDGET` is a placeholder starting
  allowance for the Settings > Usage page — real budgets/pricing get decided later.
- `mobile/.env.local` (gitignored): `NEXT_PUBLIC_AINEKO_SERVER_URL` + `NEXT_PUBLIC_AINEKO_TOKEN`,
  already pointed at the tailnet server URL below with the matching token. Static export bakes
  these in at build time — rebuild (`npm run build`) after changing either.

## Tailnet demo lifecycle (same pattern as qoracle-demo)
- `aineko-demo.service` (systemd --user, linger on): serves `mobile/out` via
  `python3 -m http.server` on `127.0.0.1:3002`. Enabled and running.
- `aineko-server.service` (systemd --user, linger on): runs `server/dist/index.js` on
  `127.0.0.1:8788`. Enabled but **not started** — it fails fast at boot without
  `OPENROUTER_API_KEY`, so it's left off until the key is pasted in. Start it with
  `systemctl --user start aineko-server` once the key is in place.
- Tailscale Serve: `https://foundry.tail567d18.ts.net:8445` -> frontend,
  `https://foundry.tail567d18.ts.net:8446` -> backend (tailnet only). Both are exposed as
  separate HTTPS ports (not paths) so Safari never sees mixed content from the static export
  calling the API.
- After editing `mobile/`, rebuild (`npm run build`) — the demo service serves the `out/`
  directory directly, no restart needed since it's static files.
- After editing `server/`, `npm run build` then `systemctl --user restart aineko-server`.

## Keyboard handling
`src/lib/use-viewport-height.ts` (`visualViewport` height + offset tracking, feeding `--app-top`/
`--app-height` CSS vars on `.shell`) exists for testing in mobile Safari over the tailnet, where
iOS pans the visual viewport to reveal a focused input and drags the fixed header along with it
mid-transition. That panning is a Safari browser-chrome quirk, not something a WKWebView does.
`capacitor.config.ts` sets `Keyboard: { resize: "native" }`, which resizes the actual WKWebView
frame around the keyboard, natively and in sync with its animation -- once this is running as the
built app rather than in a browser tab, this whole class of glitch should not reproduce. Leave the
`visualViewport` hook in place regardless; it's harmless inside Capacitor and still needed for
`npm run dev`/tailnet browser testing.

## Shipping to the App Store

**App name: "Aineko"** (settled 2026-09-21). Named for Manfred Macx's cat in Charles Stross's
*Accelerando* -- an uploaded pet that quietly understands more than it lets on, which fits. Bundle
ID: `com.commandminelabs.aineko`.

Naming history, kept for context since it explains why old bundle IDs are lying around
unused in the Developer Portal (harmless -- see below):
1. **"CatGPT"** (`com.catgpt.app`) -- the original working name/joke. Dropped for two reasons:
   Apple's review has a history of scrutinizing "GPT"-named apps for implying an OpenAI/ChatGPT
   affiliation, and separately `com.catgpt.app` turned out to already be registered to an
   unrelated third party globally (Apple's bundle namespace is first-come-first-served across
   every developer, not scoped to this team -- nothing to do with this repo or account).
2. **"CatChat"** (`com.commandminelabs.catchat`) -- avoided "GPT" entirely, registered and
   archived successfully, but the *name* "CatChat" was already taken by another app on the Store
   (separate namespace from the bundle ID collision above).
3. **"Aineko"** (`com.commandminelabs.aineko`) -- landed here since it sidesteps both the
   trademark-adjacency problem and the "everyone already grabbed the obvious animal+suffix combo"
   collision problem the first two names kept hitting.

Everything internal was renamed to match on 2026-09-22: repo dir (`~/catgpt` -> `~/aineko`, on
foundry and the Mac), Mac build dir (`~/catgpt-build` -> `~/aineko-build`), systemd units
(`catgpt-{demo,server}` -> `aineko-{demo,server}`), npm package names, `NEXT_PUBLIC_CATGPT_*` ->
`NEXT_PUBLIC_AINEKO_*`, OpenRouter `X-Title`, and the localStorage key (see `src/lib/chats.ts` --
`catgpt.chats.v1` is still read once as a legacy key so builds (1)-(9) keep their history). The
names above are history only; nothing live should still say "catgpt".

**Important, learned the hard way:** a bundle ID registered with Apple can never be reclaimed or
reused once App Store Connect has seen it, even if the app record using it is deleted and no build
was ever uploaded -- `com.catgpt.app`'s registration attempt failed so nothing was ever claimed
there, but `com.commandminelabs.catchat` *did* register successfully and stays orphaned forever.
This is genuinely harmless: bundle ID and SKU are never shown to a user anywhere, so a handful of
dead identifiers sitting unused in the Developer Portal costs nothing. An App Store Connect **app
record**, by contrast, *is* deletable, but only while it's still in "Prepare for Submission" status
with no build ever uploaded to it.

**Registration confirmed working (2026-09-21):** `com.commandminelabs.aineko` is registered with
Apple under team `WRU32M8YQ8` (same team as qoracle) and a distribution provisioning profile
exists for it -- verified by producing a real signed, exported `App.ipa` on the Mac
(`~/aineko-build/test-4/export/` there; test-1 through test-3 are the earlier name attempts, same
directory tree). Nothing was ever uploaded or submitted through any of these tests; export
destination was `export`, not `upload` -- this only proves signing/registration works, it does not
touch App Store Connect or App Review. Recipe used (same as qoracle's `~/qoracle-build/build-*.sh`
scripts): unsigned archive (`CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO archive`), then
`-exportArchive -allowProvisioningUpdates` against `~/qoracle-build/ExportOptions.plist`'s pattern
(`method: app-store-connect`, `signingStyle: automatic`, `teamID: WRU32M8YQ8`) -- automatic signing
resolves and registers everything at the export step, not the archive step.

App record created in App Store Connect 2026-09-21 (Frank, from his Windows laptop, per
`[[project-mac-workflow]]` -- App Store Connect/metadata/screenshots always happen there, not from
this box).

**Build 1.0 (1) uploaded to App Store Connect 2026-09-21 -- first real upload, currently
processing for TestFlight.** Icon + splash generated from `mobile/assets/icon-only.png` /
`splash.png` (composited from `aineko-logo.png` onto the app's `#12121a` dark background, logo's
own near-white background flood-filled to transparent first) via
`npx capacitor-assets generate --ios`, same tool and `mobile/assets/` convention as qoracle. Fixed
two things the Capacitor scaffold gets wrong by default and doesn't update on `cap sync`:
`CFBundleDisplayName` in `Info.plist` (stays whatever it was at `cap add ios` time -- was stuck on
"CatGPT" through two renames, now "Aineko"), and added `ITSAppUsesNonExemptEncryption=false` so
App Store Connect doesn't ask an export-compliance question after every upload. **Next upload must
bump `CURRENT_PROJECT_VERSION`** (pbxproj, both configs, currently `1`) -- same discipline as
qoracle. Recipe used (same as qoracle's `~/qoracle-build/build-*.sh` scripts): unsigned archive
(`CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO archive`), then `-exportArchive
-allowProvisioningUpdates` with an ExportOptions.plist matching `~/qoracle-build/ExportOptions.plist`
(`method: app-store-connect`, `signingStyle: automatic`, `teamID: WRU32M8YQ8`) but
`destination: upload` instead of `export` -- `export` only proves signing/registration without
touching App Store Connect (used for the naming-attempt tests below); `upload` is the real thing.

**Build 1.0 (2) uploaded 2026-09-21 -- icon redo + iOS 15 bump, same day.** Frank's own logo
critique on build 1's icon: dark background wasn't his design (he made it light), and it read too
small -- turned out the *source* PNG had a lot of built-in whitespace around the mark itself, so
naive resizing never fixed it; fix was `-trim`ing to the actual ink bounding box first, then
recompositing at the target margin. Landed on 7% top/bottom margin (his call after seeing options),
which on this logo's proportions (611x744 trimmed, taller than wide) works out to ~14.7% left/right
-- if the logo ever changes, recompute from the trimmed aspect ratio, don't assume 7%/14.7% carries
over. Background is light (his original), not dark -- that was my unrequested change in build 1,
reverted. Also bumped `platform :ios` (Podfile) and `IPHONEOS_DEPLOYMENT_TARGET` (pbxproj, all 4
occurrences) from 14.0 to 15.0 -- Apple's build-1 upload warned that iOS 14 won't be accepted for
upload at all starting Spring 2027; no reason to wait, bundled into this build rather than shipping
a build for the icon alone. No MinimumOSVersion warning on the build-2 upload.

Build history / naming-attempt test archives, all local-only except the real uploads:
`~/aineko-build/test-1` through `test-4` (unsigned export tests through each rename),
`~/aineko-build/1.0-1` (first real upload), `~/aineko-build/1.0-2` (icon + iOS 15 bump),
`~/aineko-build/1.0-3` (membership/StoreKit purchase screen, see below).

Icon margin: went through 7% -> "a touch too big" -> 10% top/bottom, which is what shipped in
build 1.0-2 and everything after. `mobile/assets/icon-only.png` and the compiled
`AppIcon-512@2x.png` are the current source of truth if this ever needs re-deriving.

## In-app purchase / membership
Real StoreKit wiring, not a mockup -- added 2026-09-21 specifically because Apple's IAP review
requires a genuine screenshot of the purchase flow, and faking one would mean shipping a
non-functional button that looks real. Mirrors qoracle's proven `@capgo/native-purchases` 7.19.3
integration (same plugin, same version) rather than inventing a new pattern.
- `mobile/src/lib/membership.ts`: wraps `getProducts`/`purchaseProduct`/`getPurchases`/
  `restorePurchases`/`manageSubscriptions` for the single product
  `com.commandminelabs.aineko.monthly`. `refreshMembership()` finds that product in `purchases` with
  `isActive === true && !revocationDate` and keeps its StoreKit 2 `jwsRepresentation`, which every
  request sends as `X-Aineko-Membership` (see "Tiers and identity" below).
- `mobile/src/components/MembershipModal.tsx`, reached via Settings -> Membership. Shows price
  (live from StoreKit via `getProducts`), a Subscribe button, and Restore purchases. On the tailnet
  browser build (no StoreKit there) it just says purchases aren't available there instead of
  crashing -- gated on `Capacitor.isNativePlatform()`.
- **What membership gets you (since build 1.0 (10), 2026-09-22):** the bonus animals (horse, goat,
  snake -- `membersOnly` in both `animals.ts` files) and about 10x the free chat allowance. Both are
  enforced server-side off a verified signed transaction, not just hidden in the app. (Builds
  (3)-(9) had a working purchase button that unlocked nothing, labeled "Unlimited chats" -- a copy
  mistake nobody meant, and an App Review 3.1.2(a) risk.) The modal shows the subscription's
  title, length and price, renewal terms, Manage subscription for members, and the Terms of Use
  (Apple's standard EULA) + Privacy Policy links Apple requires for auto-renewables.
- Shipped in **build 1.0 (3)**, uploaded 2026-09-21. Needs pod install on the Mac (new native
  plugin) -- already done as part of this upload, but if resyncing from scratch, `npx cap sync ios`
  on the Mac (not just locally) is required before archiving.
- **Getting the App Review screenshot** (why this was built): requires a real device with
  TestFlight and a Sandbox Apple ID (Settings -> App Store -> Sandbox Account on the test device,
  or it'll prompt at purchase time) -- this can only happen on Frank's own phone, not from this
  box. Once captured, screenshots go in `~/deliverables/aineko/` on foundry (mirrors
  `~/deliverables/qoracle/`).

## Production hosting (aineko.bromsg.com)
Deployed 2026-09-21 on the **Hetzner box** (`hetzner` SSH alias, user `gork`) -- the same shared
production infrastructure that runs qoracle, cli-games.com's live site, and a large number of other
real services behind a single hand-maintained `~/services/docker-compose.yml` and
`~/services/caddy/Caddyfile`. This is **not** a sandbox; treat every edit there like editing
someone else's production config, because it is. Backups were taken before any edit:
`~/services/{docker-compose.yml,.env}.bak-aineko-add-<timestamp>` and
`~/services/caddy/Caddyfile.bak-aineko-add-<timestamp>` on Hetzner.

Mirrors qoracle's exact pattern:
- Source lives at `~/services/aineko/` on Hetzner (rsynced copy of `server/`, not a git checkout --
  same as qoracle). Re-rsync + `docker compose build aineko` + `docker compose up -d aineko` to
  deploy a server change. No CI/deploy hook; it's manual, same as qoracle.
- `Dockerfile` added to `server/` for this (previously only ever run via systemd/node directly) --
  multi-stage node:22-alpine, same shape as qoracle's minus the `pages/static` copy (no static
  asset folder here, pages are inline HTML in `src/pages.ts`).
- `docker-compose.yml`: `aineko` service, port 8788, `AUTH_TOKEN`/`OPENROUTER_API_KEY` from
  `${AINEKO_AUTH_TOKEN}`/`${AINEKO_OPENROUTER_API_KEY}` in `~/services/.env` on Hetzner (**separate
  token and same OpenRouter key** as the foundry tailnet instance -- deliberately not sharing the
  auth token across environments). `./aineko-data:/data` volume + `USAGE_FILE=/data/usage.json` env
  var (added to `server/src/usage.ts`, defaults to the old relative-to-dist path when unset) so the
  token counter survives container redeploys, same reasoning as qoracle's `POOL_FILE`.
- `server/src/pages.ts` (new): bare-bones landing page (`/`), privacy policy (`/privacy`), and
  Acceptable Use policy (`/terms`, added 2026-09-21) -- dark-themed to match the app, no
  analytics/tracking of any kind, genuinely accurate to what the app does (chat text goes to
  OpenRouter, not logged by our server; chat history is device-local only; payments are Apple
  StoreKit, we never see them). `/terms` prohibits illegal use and reserves the right to terminate
  access -- the cheap, standard precaution discussed after a risk conversation about liability for
  what a user could type into the chat. Contact address `aineko@bromsg.com`.
- **Live as of 2026-09-21.** `https://aineko.bromsg.com/` and `/privacy` both verified `200` from
  outside. Turned out `*.bromsg.com` already had a wildcard A record to Hetzner (proxied) from
  before this project, so no DNS change was actually needed -- the "cli-games.com pending DNS
  cutover" comment I initially cited as precedent for staging this was actually a **stale leftover
  comment** (that cutover already happened, past tense "ex-Vercel" in the file); there was never an
  active staging convention to follow, and staging/unstaging cost nothing since the wildcard meant
  it was already resolving.
- **Caddy hit a real bug getting this live, worth knowing if it happens again**: the running
  `caddy` container's bind-mounted `/etc/caddy/Caddyfile` stopped reflecting host file changes
  entirely (proved with a literal marker-line test: appended to the host file, container still
  showed old content) -- `caddy reload`/`validate`/`adapt` all kept parsing a stale cached view, so
  edits silently never took effect despite every command reporting success. A full box reboot
  (2026-09-21, also cleared an already-overdue pending kernel update, `6.8.0-136` ->
  `6.8.0-139`) fixed it; a `docker restart caddy` alone likely would have too, untested since the
  reboot was already warranted. If a future Caddyfile edit "succeeds" but doesn't seem to take
  effect, check whether `docker exec caddy md5sum /etc/caddy/Caddyfile` actually matches the host
  file before assuming the edit itself is wrong.
  **Likely root cause (2026-09-22):** the Caddyfile is a *single-file* bind mount
  (`./caddy/Caddyfile:/etc/caddy/Caddyfile:ro`), which pins the file's inode at container start.
  Any edit that writes a new file and renames it over the old one (`sed -i`, most editors, Python's
  atomic-save patterns) gives the host path a new inode the container never sees. **Edit it in
  place** (truncate-and-write the same inode, e.g. `open(..., "r+")` or `cat tmp > Caddyfile`) and
  confirm with `stat -c %i` before/after -- the 2026-09-22 trusted_proxies edit was done that way
  and took effect on a plain `caddy reload`, no restart.
- App Store Connect fields, now valid: Support URL `https://aineko.bromsg.com/`, Privacy URL
  `https://aineko.bromsg.com/privacy`, contact `aineko@bromsg.com`. Marketing URL left blank,
  matching qoracle.
- **Build 1.0 (10)+ talks to this production server** (Frank's call, 2026-09-22). The Mac's
  `~/aineko/mobile/.env.local` holds the production URL + Hetzner's `AINEKO_AUTH_TOKEN`; the
  tailnet values it used to hold are saved at `~/aineko-build/env.local.tailnet-before-1.0-10` on
  the Mac. foundry's own `mobile/.env.local` deliberately stays on the tailnet server, so the
  `aineko-demo` browser build keeps hitting the dev instance. **When syncing source to the Mac,
  exclude `.env.local`** or the next TestFlight build silently goes back to the tailnet. Server
  changes now need the Hetzner redeploy (rsync + `docker compose build/up aineko`) to reach
  TestFlight users, not just a foundry restart.

## Abuse / liability posture
- **Rate limiting** (`server/src/rate-limit.ts`, added 2026-09-21): 20 req/min/IP on `POST /chat`
  only, in-memory fixed-window, no dependency added. Deliberately content-blind -- it only counts
  requests, never inspects message text, so it can't contradict the "we don't log messages"
  privacy policy. Keys on `req.ip`, which only means anything if `trust proxy` matches the real
  proxy chain -- see "Client IPs behind proxies" below.
- **Client IPs behind proxies** (fixed 2026-09-22): originally `app.set("trust proxy", true)`,
  which was wrong twice over. `aineko.bromsg.com` is Cloudflare-proxied (orange cloud), and Caddy
  didn't trust Cloudflare, so Caddy overwrote X-Forwarded-For with the *Cloudflare edge* IP --
  every user was bucketed by whichever edge node relayed them, sharing rate limits and budgets with
  strangers. And `true` takes the left-most XFF entry, which is client-controlled whenever a proxy
  passes XFF through. Now: `trust proxy` = `TRUST_PROXY_HOPS` (env, default 1 = foundry's Tailscale
  Serve; `2` on Hetzner = Cloudflare -> Caddy), and the `aineko.bromsg.com` block in Hetzner's
  Caddyfile has `trusted_proxies <Cloudflare ranges>` on its `reverse_proxy` (scoped to this one
  site, not Caddy's global option, so no other service's behavior changed). Verified live: a
  request from Hetzner through Cloudflare recorded Hetzner's own IP, and a forged
  `X-Forwarded-For` was ignored. **If Cloudflare ever changes its ranges**
  (https://www.cloudflare.com/ips/), update that Caddy block or users collapse back into edge-IP
  buckets.
- **OpenRouter account**: currently Frank's personal account, accepted as a short-term risk while
  Command Mine Labs LLC's registration is still in progress. The plan once it's registered: an
  OpenRouter **organizational account** (a real, documented account type in their ToS, distinct
  from personal) funded by the LLC's own business card -- this is the actual sanctioned firewall
  mechanism (genuine legal liability separation), not a workaround like a prepaid card or crypto
  payment, which only obscure a shared-payment-method fraud signal without separating liability at
  all. OpenRouter's ToS bans "multiple accounts as a single user... to bypass... limits," which is
  about sock-puppeting, not about a real, openly-declared business entity's own account -- so this
  is using the sanctioned channel as intended, not evading it. Whether an existing personal account
  can convert to organizational, or a fresh signup is needed, is unconfirmed -- ask OpenRouter
  support when the entity exists rather than assume.
- **Acceptable Use policy** (`/terms`, see above) is the other half of this -- cheap, standard,
  already live.
- **Token budgets** (`server/src/token-budget.ts`, added 2026-09-21 per-IP; per-caller tiers since
  2026-09-22): the piece the per-minute rate limit couldn't provide -- that one caps burst speed but
  not total damage over time (a script sitting at exactly 20 req/min all month never trips it
  while running up ~$70 in API cost). Weekly + monthly fixed-window token ceilings, checked before
  each `/chat` via `checkBudget()`, incremented via `recordTokens()` from `openrouter.ts` at the
  exact point actual usage is known (same call site as the global `recordUsage()`).
  - **Tiers and identity** (`resolveCaller()` in `index.ts`): a request with a valid
    `X-Aineko-Membership` (StoreKit 2 JWS, verified offline in `src/entitlement.ts` against a
    pinned Apple Root CA - G3 plus Apple's leaf/intermediate marker OIDs -- no dependency, covered
    by `npm test`) is metered as `member:<originalTransactionId>`, which follows the person across
    networks and reinstalls. Otherwise `install:<X-Aineko-Install>` (a random ID the app mints on
    first launch, `mobile/src/lib/ids.ts`) at free limits, **plus** `ip:<addr>` at 2x member limits
    as a backstop so minting fresh install IDs doesn't mint fresh allowances. No install header
    (builds (1)-(9)) = `ip:<addr>` at free limits. Bonus animals return 403 `members-only` for
    non-members. Not covered: a refund after the app last fetched its transaction stays honored
    until that JWS's expiry (at most one billing period); App Store Server Notifications would
    close it if it ever matters.
  - **Numbers -- Frank's rule (2026-09-22): charge X, allow X/2 of API spend a month and X/8 a
    week.** `src/limits.ts` derives every cap from `MEMBER_PRICE_USD` (Hetzner compose sets
    `0.99`) and `COST_PER_MTOK_USD` (0.12, measured: ~780 prompt / ~45 completion tokens per message
    with the full history window, at gemini-2.5-flash-lite's $0.10/$0.40 per M; fallback models
    cost the same or less). At $0.99: members ~4.1M tokens/month, ~1.03M/week (~5,000 / ~1,250
    messages); free = `FREE_FRACTION` 0.1 of that (~500/month, ~125/week). "About 10x" in the app's
    copy mirrors `FREE_FRACTION` -- change both together. Realistic heavy use (100 messages/day
    every day) is ~3,000/month, ~$0.30, so the member cap only ever bites scripts. Apple's cut
    isn't in the rule: at $0.99 a member maxing the cap still nets $0.19 (30%) / $0.34 (15% small
    business). Recompute `COST_PER_MTOK_USD` if the model or prompt length changes much.
  - Persisted like `usage.json` (`TOKEN_BUDGET_FILE` env var, points at the mounted volume on
    Hetzner) so quotas survive restarts/redeploys instead of giving every IP a free reset. Flushes
    to disk on a 60s interval, not on every request, plus on SIGTERM/SIGINT once in-flight replies
    finish. Both files are written atomically (`src/atomic-write.ts`).
  - **This never actually worked on Hetzner until 2026-09-22**: `~/services/aineko-data` was owned
    by uid 1001 (`gork`) but the container runs as `node` (uid 1000), so every write failed with
    EACCES (visible in `docker logs aineko`) and budgets silently reset on every redeploy. Fixed by
    `chown 1000:1000 aineko-data`, same ownership as `qoracle-data`. Any new data volume for a
    `USER node` container needs the same.

## Monetization
Subscription model (unlike qoracle's one-consumable-plus-nonconsumables), priced deliberately low,
meant to roughly cover OpenRouter API cost rather than turn a profit. **Price as of 2026-09-22:
App Store Connect has it at $5/month (Frank set it there); the recommendation from the usage math
(see "Token budgets" above) is $0.99, which is what the server's `MEMBER_PRICE_USD` assumes.**
Whichever it ends up being, keep `MEMBER_PRICE_USD` in Hetzner's compose in sync -- it sizes every
allowance. May run
negative; that's an accepted, explicit risk, not an oversight. Two independent fallbacks if the
economics don't work: kill the app
entirely, or paywall the `/chat` feature itself (server-side) while the free app stays installed.
Note if the second path is ever taken: changing an app's price or removing an IAP is unrestricted
at any time, but Apple's guidelines forbid retroactively stripping access from users who already
have it for free -- a free-to-paid switch only closes the door to *new* downloads/subscribers, it
does not evict anyone already in. Existing subscribers on a sunset IAP keep it until they cancel or
it's fully deprecated.

## First-impression pass (build 1.0 (4), 2026-09-21)
Frank's own first real look at the app via TestFlight surfaced two things worth remembering.

**The splash "paint didn't fill" bug was never the artwork -- it was
`ios/App/App/Base.lproj/LaunchScreen.storyboard`.** That file has its own `imageView` background
color, completely independent of `mobile/assets/splash.png` or anything `capacitor-assets`
generates, and Capacitor's scaffold defaults it to solid white and never revisits it. Any edge gap
in the image's `scaleAspectFill` reveals that white backing color. Fixed to the app's `#12121a`
directly in the storyboard XML (custom sRGB color, not a systemColor). **If a future logo/theme
change ever brings back a stray white edge on the native splash, check this file before assuming
the PNG asset is at fault again** -- it looks like an image problem and isn't one. Also deleted
`splash-2732x2732*.png`, leftover unreferenced files from the original `cap add ios` scaffold that
`Contents.json` never pointed at (harmless, but dead weight).

**Splash sizing history**: logo went through un-trimmed-1400px-wide -> trimmed-and-reasoned-per-
icon-margins -> Frank's verdict "smaller, sleeker" -> shipped at a trimmed height of 420px in the
2732px canvas (~15% of canvas height). If this needs revisiting, regenerate from
`mobile/public/aineko-mark.png` (the trimmed, transparent-background source also used by the boot
shimmer below) rather than re-deriving from the original untrimmed logo file.

**Added a JS-side "boot screen"** (`mobile/src/components/BootScreen.tsx`), shown for a fixed
~1.1s on every app open before the chat UI appears -- hands off visually from the native splash
(same dark bg, same small centered mark) with a diagonal shimmer sweep across it. Technique: a
CSS `linear-gradient` band on an overlay div, masked with `mask-image` against the logo's own PNG
alpha channel (`mobile/public/aineko-mark.png`) so the highlight is clipped exactly to the mark's
silhouette, `mix-blend-mode: overlay` to blend as a highlight rather than a flat wash, animated via
`background-position`. This is the same *idea* as qoracle's edge-lit SVG sweep
(`~/qoracle/docs/prototypes/loading-screen/index.html`) adapted for a raster logo instead of hand-
traced SVG paths -- Aineko's mark was never vectorized, so masking against the raster alpha channel
was the pragmatic equivalent rather than tracing the knot shape into SVG paths. Unlike qoracle's
loader, this isn't tied to real asset-loading readiness -- nothing async blocks Aineko's first
paint, so it's a fixed-duration aesthetic beat, not a real loading state.

**"Feels empty" fix**: new chats now open with the animal's own in-character **greeting** as the
first message (`AnimalMeta.greeting` in `mobile/src/lib/animals.ts`) instead of the old generic
tip line -- this replaced the tip system entirely (`lib/tips.ts` deleted, `ChatMessage`'s `"tip"`
role variant removed) rather than showing both, since one bot-ish message before the user's typed
anything reads better than two. Also added tappable **starter prompt chips**
(`STARTER_PROMPTS` in `page.tsx`) above the composer, visible only until the first user message in
a chat -- tapping one sends immediately rather than just filling the input, matching how most
chat apps do it. Deliberately skipped a first-run tour/walkthrough (real chat apps avoid these,
they add friction) -- **corrected in build 1.0 (5), see below** on the keyboard auto-focus call.

## Second look (build 1.0 (5), 2026-09-21) -- Frank's screenshots vs. build (4)
Frank sent the actual bad-logo screenshot plus his four reference apps' open/sidebar screens
(ChatGPT, Grok, Gemini, Claude -- saved in `~/deliverables/aineko/chatbot-landing/`). Two real
corrections came out of comparing against them.

**The white patch was never fixed in build (4) -- it was misdiagnosed.** It isn't a compositing or
background issue at all: `aineko-logo.png`'s left ear ribbon **encloses a fully interior pocket of
background-colored pixels**, cut off from the canvas edges by the ribbon strokes on all sides. The
original flood-fill-from-the-four-corners technique (used for every icon/splash/mark asset so far)
can only reach pixels connected to those corners -- an enclosed interior pocket like this one is
topologically unreachable from outside, no matter how many corners you seed from. It reads as
"still all white inside" because that description is literally correct: it's untouched background
color, not a highlight, not a rendering artifact. **Fixed by adding an explicit interior seed point**
(`-draw "color 500,350 floodfill"` on the original 1450x1085 source, alongside the four corner
seeds) before re-trimming and recompositing every downstream asset (`icon-only.png`, `splash.png`,
`public/aineko-mark.png`) from that corrected source. **If any future logo edit reintroduces an
enclosed shape** (a closed loop, a fully bounded gap), the same class of bug will recur, and the
fix is the same: find a pixel inside the enclosed region and add it as an explicit flood-fill seed
-- corner seeding alone can never be sufficient for a logo with interior negative space.

**Auto-focusing the keyboard was the right call, reversed from build (4)'s guess.** All four of
Frank's reference apps (ChatGPT, Grok, Gemini, Claude) bring the keyboard up immediately on
opening a chat -- unanimous, not a coin flip. `page.tsx` now focuses the composer input
(`inputRef`) whenever `activeChat.id` changes, deliberately scoped to chat-switches only (not on
every new message) so it doesn't fight a user who's deliberately dismissed the keyboard mid-
conversation.

**Sidebar now has an app-name header** ("Aineko", `.sidebar-title` in `Sidebar.tsx`) above "+ New
chat" -- every reference app labels its sidebar (ChatGPT, Grok, Gemini, Claude all do), ours didn't.

**Starter chip copy reframed as instructions, not example messages** -- Frank's own phrasing
("try saying hi", "give the cat a name") is meta/instructional, not something you'd literally type.
`STARTER_PROMPTS` is now `{label, message}` pairs so the button can say "give them a name" while
actually sending a real first-person message ("I'm going to call you Waffles.") when tapped --
sending the label text verbatim would have produced a nonsensical exchange.

**Also fixed in this pass**: the empty-state topbar still said "CatGPT" (`page.tsx` line ~145) --
a leftover from before the app was renamed to Aineko, missed until this screenshot comparison
surfaced it.

**Upload note**: this build's first two export attempts failed with a generic Apple server-side
error ("An unexpected error occurred on the server side") -- both died in under 10 seconds, which
in hindsight was the tell that it was transient (a real config problem tends to fail the same way
every time, not intermittently). Third attempt succeeded after sitting ~15 minutes on "Waiting for
App Store Connect SPI analysis response" before proceeding normally. If a future upload fails the
same generic way, retry before assuming something in the build broke. Same ~15 minute stall
recurred on build (5)'s upload the next day -- pattern repeats, still transient, not a one-off.

## Regression (build 1.0 (6), 2026-09-22) -- app icon shipped dark by mistake
While fixing the interior-gap logo bug for build (5), I built a throwaway dark-background test
composite (`icon-verify-v2.png`) purely to visually confirm the fix worked, then **copied that
test file directly into `mobile/assets/icon-only.png`** instead of regenerating a proper
light-background version -- overwriting Frank's actual preferred icon background (light, his
original design) with the wrong one. Build (5) shipped with a dark icon. Frank caught it
immediately ("you made the app icon dark again"). Fixed in build (6): regenerated
`icon-only.png` at the same established 10% margin from the corrected (interior-gap-fixed) mark,
composited onto the light background this time, verified visually before shipping. **Lesson**:
when generating a throwaway verification image, name it unambiguously as scratch/temp and never
let it become the thing that gets copied into `mobile/assets/` -- the light-vs-dark distinction
between icon and splash is a real, intentional difference (icon = Frank's original light design,
splash = dark to match the app's own theme), not a detail to get casually swapped mid-fix.

## Keyboard auto-focus, actually fixed (build 1.0 (7), 2026-09-22)
Build (5)'s auto-focus (a `useEffect` keyed on `activeChat.id` calling `inputRef.current?.focus()`)
did not work on-device -- Frank still didn't see the keyboard come up. Root cause: **iOS only
shows the on-screen keyboard for a `.focus()` call made synchronously inside a real user gesture.**
A `useEffect` fires after React's normal (async) re-render, which is outside the tap's call stack
as far as WebKit is concerned -- `.focus()` still moves `document.activeElement` (which is exactly
what my Playwright verification checked and why it falsely looked fixed), but the soft keyboard
itself won't appear. Desktop Chromium doesn't enforce this restriction, so headless testing can't
catch this class of bug -- **don't trust a Playwright focus check as proof the iOS keyboard will
open; it only proves DOM-level focus, which is necessary but not sufficient.**

Fixed with `flushSync` (from `react-dom`) wrapped around the state updates in `handleNewChat` and
`handleSelectChat`, followed by the `.focus()` call, all still inside the original `onClick`
handler -- this forces the DOM commit to happen synchronously so the input exists and we're still
within the tap's call stack when focus is requested. The `useEffect`-based approach was removed
entirely, not layered alongside the fix.

## Enrichment pass (build 1.0 (7) server-side, 2026-09-22) -- where "Frank's style" actually lives
Frank asked for an enrichment pass on responses and asked for the hardcoded-vs-LLM split. Worth
keeping this clear for future sessions: **greetings (`mobile/src/lib/animals.ts`) and starter-chip
text (`STARTER_PROMPTS` in `page.tsx`) are 100% hardcoded, shown once, never touch the LLM.**
Every real chat reply, from the first message onward, is 100% LLM-generated per request. The
highest-leverage place to inject voice is therefore *not* individual hardcoded lines -- it's
`server/src/animals.ts`'s `personality`/`vocabulary` fields and the shared prompt template in
`server/src/openrouter.ts`'s `buildSystemPrompt()`, since those steer every generated reply at
once.

**Banned words (Frank, 2026-09-22):** nothing a kid would get in trouble for saying out loud --
"nicker" specifically (the horse whinnies instead), plus "pussycat"/"horny" as obvious cousins.
The prompt asks; `server/src/kid-safe.ts` guarantees (swaps on every reply and on echoed history).
Extend the list there when another one turns up.

Changes: added a per-animal `triggers` field (`Animal` type, `animals.ts`) replacing the single
generic hardcoded trigger-word list that used to apply identically to all six species regardless
of whether it made sense (the old shared list included "good boy/girl" and "walk", which never
fit a duck or a fish). `buildSystemPrompt` now builds its trigger-word guidance per-animal from
this field, and animals with `triggers: []` (parrot, fish) get a fallback line deferring to their
personality text instead. Also sharpened every animal's `personality` with more specific
comedic angles, and rewrote the prompt's own instructional language to explicitly ask for
committed, unhedged misunderstandings and to vary the joke shape across replies rather than
repeating the same "trigger word -> literal reaction" beat every time. Verified live post-deploy:
dog picked up "walk" from "I'm exhausted, I can't even walk to the mailbox" and reacted with
excitement (the exact mismatch this was built for); cat fled at "vet"; parrot echoed a fragment
("STOVE") from an unrelated message; fish reacted to tone alone with no trigger words present.
Deployed to both foundry (tailnet dev) and Hetzner (production) -- this is a server-only change,
no new mobile build was needed for it (build (7) only had to ship for the keyboard fix).

## Reversed the greeting, killed the dead empty-state (build 1.0 (8), 2026-09-22)
Frank reversed an earlier decision: he does NOT want the animal to send an in-character greeting
as the first message in a new chat ("i do NOT want the animal to message first. none of the other
ai apps do that, so why should ours?"). He also reported the app cold-opening onto a dead "Pick a
chat, or start a new one" + "+New chat" screen -- he wants it to land directly in a ready-to-type
state instead.

**Removed the greeting entirely.** `AnimalMeta` in `mobile/src/lib/animals.ts` no longer has a
`greeting` field (was `{sounds, narrative}` per animal, shown once as message 0 of every new
chat). `handleNewChat` in `page.tsx` no longer inserts it -- a new chat now starts with an empty
`messages` array. The starter-prompt chips (`STARTER_PROMPTS`, unchanged) are now the *only*
"inspiration" mechanic, matching ChatGPT's pattern -- this is intentional, not a fallback.

**Killed the empty-state screen.** Added `ensureDraft(list)` in `page.tsx`: if the most-recent
chat (index 0 -- chats are always prepended on creation, so a draft, if one exists, is always
there) has zero user messages, reuse it as the active chat instead of creating a new one;
otherwise create a fresh chat and make it active. Applied at every point that used to leave
`activeChatId` null or create chats ad hoc: the initial hydration effect (cold open), explicit
"+ New chat" taps, `handleDeleteChat` (only when the deleted chat was the active one), and
`handleClearChats`. Net effect: `activeChat` is non-null immediately after hydration completes,
every time, so the composer + starter chips are always what you see -- and repeat app opens
without typing anything reuse the same draft chat rather than piling up empties in the sidebar.
The old `empty-state` JSX branch is now an unreachable fallback (BootScreen's own ~1.1s covers
the brief pre-hydration window regardless).

**Cold-launch keyboard auto-focus: disclosed limitation, not a bug.** Build (7) fixed
*tap-triggered* focus (`flushSync` inside `onClick`, see above) -- that fix is untouched and
still correct. Cold launch is a different problem: there is no tap to be "inside of." Added a
plain `useEffect` keyed on `hydrated` that calls `.focus()` once hydration finishes, which
reliably delivers DOM-level focus (a ready blinking cursor, confirmed via Playwright --
`document.activeElement` lands on the composer `<input>`) but, per the same WebKit restriction
documented in build (7), **will not pop the actual soft keyboard on a true zero-tap cold
launch**. Confirmed there's no native escape hatch: `@capacitor/keyboard`'s `show()` is
Android-only per its own doc comment. Told Frank this plainly rather than re-attempting the same
useEffect trick and calling it fixed a second time.

Verified via Playwright (static export served locally): cold-open body text has no greeting
bubble, chips + composer render immediately, `document.activeElement` is the input. Typechecked
(`tsc --noEmit`) and built clean. Shipped as build 1.0 (8) -- bumped `CURRENT_PROJECT_VERSION`
7 -> 8 in `project.pbxproj` (both Debug and Release configs), synced source + pbxproj to the Mac,
rebuilt (`npm run build`, `npx cap sync ios`), archived unsigned
(`CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO`) to `~/aineko-build/1.0-8/App.xcarchive`,
exported with the same `ExportOptions.plist` used for every prior build
(`destination: upload`, automatic signing, `manageAppVersionAndBuildNumber: false`) -- following
the `~/aineko-build/1.0-<N>/` convention already established by builds (1) through (7).

## Cold-launch focus: two regressions from build (8)'s own fix (build 1.0 (9), 2026-09-22)
Build (8) made cold-launch keyboard focus *worse* in two specific ways Frank caught immediately
on-device -- both were consequences of the naive `useEffect` approach, not new problems.

**1. Keyboard popped too early, during the boot animation.** Build (8)'s focus effect was keyed
on `hydrated`, which resolves almost instantly (`loadChats()` is a synchronous `localStorage`
read) -- but `BootScreen`'s ~1.1s on-screen duration was tracked by its *own* internal
`setTimeout`, completely decoupled from `hydrated`. The two were never synchronized; focus (and
therefore the keyboard) fired the moment data loaded, underneath the still-visible boot screen,
instead of appearing "in unison with the chat window" the way Frank asked for. **Fix**: lifted
the boot timer out of `BootScreen` entirely -- it's now a dumb component taking a `hidden: boolean`
prop -- and into `page.tsx` as `bootDone` state (`setTimeout(..., 1100)`, same duration, same
component-mount timing, just relocated). The focus effect now waits on `hydrated && bootDone`
instead of `hydrated` alone, so the same render that flips `BootScreen` to hidden is the render
that fires focus -- verified via Playwright: focus is still on `<body>` at 500ms (boot screen
still up) and lands on the composer `<input>` only after 1100ms elapses.

**2. Keyboard dismissed on every send, had to be tapped back open.** Root cause was unrelated to
the WebKit gesture-timing restriction documented in builds (7)/(8) -- it was much simpler: tapping
the on-screen **Send** button is itself a browser default-focus event. A `<button>` is focusable,
and a `mousedown`/tap on one moves DOM focus to it by default, *before* the `onClick` handler even
runs -- which blurs the composer `<input>` and dismisses the keyboard the instant Send is tapped,
regardless of anything `handleSend` does afterward. (Submitting via the keyboard's own
`enterKeyHint="send"` return key was never affected -- that fires a `keydown` on the still-focused
input itself, no focus change involved.) **Fix**: `onMouseDown={(e) => e.preventDefault()}` on
both the Send button and the starter-chip buttons -- this suppresses the browser's default
focus-shift on press without touching the subsequent `click` event, so the input keeps focus (and
the keyboard stays up) through the entire send-and-await-reply round trip. Verified via
Playwright: focused element is still the `<input>` immediately after a simulated Send click.
**Lesson for any future composer-adjacent button**: any tappable control that sits next to a
focused text input needs this same `onMouseDown` guard, or it will silently steal focus and
dismiss the keyboard on tap -- easy to miss because nothing in `onClick` looks wrong.

Typechecked and built clean both locally and on the Mac. Shipped as build 1.0 (9) -- same
established recipe (bump `CURRENT_PROJECT_VERSION` 8 -> 9, sync, rebuild, `cap sync ios`,
unsigned archive, export with `destination: upload`).

## Conversation memory + hardening pass (2026-09-22) -- server live, mobile shipped in build 1.0 (10)
From a full review. **The repo had zero commits until this pass** -- nine TestFlight builds and a
production deploy with no history. Baseline committed as-is (`ffb772b`, "as of build 1.0 (9)"),
changes on top. Commit before every upload/deploy from now on, so any build can be traced back to
source. Remote: Gitea `admin/aineko` (https://git.bromsg.com/admin/aineko), pushed over the
tailnet via the `gitea-aineko` SSH alias with deploy key `~/.ssh/aineko-deploy` (same pattern as
`gitea-qoracle`).

**Conversation memory.** Every `/chat` used to send only the latest message, so "I'm going to call
you Waffles" was forgotten by the next turn, and the prompt's "vary the joke across replies" was
impossible (the model never saw its earlier replies). The client now sends the last 8 non-error
turns as `history` (`toHistory()` in `mobile/src/lib/chat.ts`); the server validates and re-clips it
(`server/src/history.ts`: max 8 kept, 500 chars each). In `buildMessages()`, the animal's own past
replies become assistant turns (in its JSON reply shape), other animals' become bracketed "[The dog
reacted: ...]" notes -- mid-chat animal switching now actually reads as a room, which is groundwork
for v0.4 chatroom mode. Old builds send no `history` and keep working unchanged.

**Parrot**: the shared prompt said "no other words, ever", contradicting the parrot's mimicry --
it only mimicked some of the time, and sometimes put the mimicked words in the narrative. `mimics:
true` on the `Animal` now swaps in a mimic-specific speech rule; verified it lands the fragment in
`sounds` ("SQUAWK! RENT! AWK!", "SQUAWK! CRACKER! AWK!").

**Server cost/reliability**: `max_tokens: 150` on every call (hard per-request cost ceiling;
average reply ~44). Timeouts were 20s *per model* x3 while the client gave up at 20s total, so
fallbacks only ran for users who had already seen an error; now 7s per model, 18s deadline for the
whole chain (under old builds' 20s client timeout), new client timeout 25s, and the upstream call
is aborted when the client disconnects. Graceful SIGTERM shutdown (Docker previously SIGKILLed after
10s since node-as-PID-1 ignored SIGTERM).

**Mobile** (build 1.0 (10)): in-character error
bubbles with a "Try again" button that re-asks in place (instead of raw "Load failed" / "The
operation was aborted."); pending/thinking state is per chat (it used to show in, and lock, whichever
chat you switched to); Enter doesn't send while an IME candidate is being confirmed; continuing a
chat moves it to the top and `ensureDraft()` finds the draft wherever it is; sidebar delete asks for
confirmation and is a real sibling button (was a span nested in a button); Membership shows "Not
available right now." instead of spinning forever when StoreKit returns no product. Verified with a
Playwright run against the demo (14 checks, real server). Note `crypto.randomUUID` (used since
build 1) needs iOS 15.4 while the deployment target is 15.0 -- harmless in practice, but either bump
the target to 15.4 or add a fallback if it ever matters.


## App Review prep, resolved 2026-09-22 (build 1.0 (10))
All five "open decisions" from the review pass were settled with Frank and shipped in build (10):
1. **Terms + Privacy links** in the Membership modal (Terms of Use = Apple's standard EULA).
2. **Membership copy** is now true -- bonus animals + ~10x allowance, enforced server-side (see "In-app
   purchase / membership" and "Token budgets").
3. **Third-party AI consent**: `ConsentModal` asks on first launch as the boot screen clears ("Sounds
   good" / "Not now"); a send without permission re-asks and then sends the queued message;
   Settings > AI & privacy reviews/revokes it (`lib/consent.ts`, key `aineko.aiConsent.v1`).
   Revoking stops sends; chats stay on device.
4. **Settings > Usage** is per-user (`GET /usage/me`): plan, week/month percent bars with reset
   dates -- percent, not tokens.
5. **App points at production** (see "Production hosting").

**Build 1.0 (11), same day: iPhone-only.** Capacitor's scaffold had `TARGETED_DEVICE_FAMILY =
"1,2"` (iPhone + iPad), which makes App Store Connect demand 13" iPad screenshots and App Review
test on iPad. Now `1`, matching qoracle -- the app still runs on iPads in iPhone compatibility mode.
Only changeable freely because the app has never shipped; once live on iPad, support can't be
dropped. No web changes, so the Mac's existing synced bundle was archived as-is.

**App Store screenshots (6.5" slot, 1242x2688):** `~/deliverables/aineko/app-store-6.5/` on
foundry (dog, room, cat, goat, sidebar). Generated, not device captures -- Frank's phone isn't a
6.5" size -- by `mobile/scripts/app-store-screenshots/shots.mjs`: the real static export rendered
in Playwright's WebKit **on the Mac** (so fonts and emoji are Apple's, not Linux substitutes),
seeded with real unedited model replies (`convos.json`, best of two runs per chat). No iOS status
bar. The goat shot shows the member view (no lock). Regenerate there after any UI change.

**Build 1.0 (12), same day -- the submission candidate:** bonus animals grouped under a "Members
only" `<optgroup>` in the picker (a section header in iOS's native picker) instead of a lock emoji
per option (Frank: clear what's new, not "special"). Sandbox purchase verified working by Frank on
TestFlight -- the real Apple-signed JWS path through `entitlement.ts` is now confirmed end to end.

**Subscription description stuck in App Store Connect (2026-09-22):** editing it errored ("a
problem occurred") for Frank. Advice given: don't delete and recreate -- a product ID, like a
bundle ID, can never be reused, so replacing it burns `com.commandminelabs.aineko.monthly` forever
and means redoing price/localizations/review screenshot plus a new build. The current text ("get a
fresh token quota every month") is accurate (the monthly allowance does reset monthly; there's
also a weekly one), so it doesn't block review; fix the wording once App Store Connect cooperates.
**Resolved same day: a fresh browser window fixed the edit** -- if App Store Connect throws a vague
"a problem occurred" on a form again, try that before anything drastic.
If it ever does get replaced: change `MEMBERSHIP_PRODUCT_ID` in both `mobile/src/lib/membership.ts`
and `server/src/entitlement.ts`, keep the server accepting the old ID too, and cut a build.

**Age rating answers (checked against Apple's "Age ratings values and definitions" page,
2026-09-22 -- there is NO AI/chatbot question, despite my first claim):** everything No/None.
"Messaging and Chat" is users talking to *each other* (No -- only to the animals); "User-Generated
Content" is *broad distribution* of user content (No -- chats stay on device); "Unrestricted Web
Access" No (Terms/Privacy links open Safari); all content categories None, including "Profanity or
Crude Humor" (sounds + a filtered, family-friendly stage direction). Expect 4+.

**Still Frank's to do in App Store Connect (from the Windows laptop):**
- Set the subscription price (recommendation $0.99; if it stays $5, set `MEMBER_PRICE_USD=4.99` in
  Hetzner's compose so allowances follow).
- Check the subscription's display name/description there doesn't still say "Unlimited chats".
- Keep the License Agreement on Apple's standard EULA, and put the Terms of Use + Privacy links in
  the app description (Apple wants them in metadata too, not just in-app).
- App Privacy answers now need: Identifiers (the random install ID) and Purchases (subscription
  status), both "App Functionality", not linked to identity, not used for tracking; plus User
  Content (messages sent to the AI provider to generate replies).
- Enroll in the App Store Small Business Program if not already (15% instead of 30%).
- On a TestFlight device: buy the membership with a Sandbox account and confirm the horse unlocks
  -- the **one path not yet verified end to end** is a real Apple-signed JWS through
  `entitlement.ts` (the test suite covers the mechanics with a look-alike chain). If the horse
  stays locked after a sandbox purchase, check `docker logs aineko` and the header size first.

## Characters, not species (2026-09-23) -- on foundry; production waits for build 12's review
Animals are now named individuals: a **species** (`SpeciesId` -- what's physically real for it,
e.g. which sounds) plus a **character** (`AnimalId` -- name, description, pronoun, personality,
triggers). `server/src/animals.ts` holds the personalities; `mobile/src/lib/animals.ts` only what
the UI draws (name, emoji, accent, thinking line) -- keep ids, order and `membersOnly` in sync.
Several characters can share a species, which is what custom animals and chatroom mode build on.

Free: **Hayley** (cat -- Frank's mom's cat, from Frank's description: small, gray, devoted,
all-night hunter bringing live gifts, unafraid of dogs, operatic at dinner), **Koba** (dog --
Frank's boxer: dumb/strong/sweet, keep-away > tug > fetch, body-slams his person, won't walk in the
heat, asks permission before chasing deer, bed hog), Dolores (cow), Gerald (duck), Winston
(parrot, mimic), Kevin (goldfish). Members: Mortimer (cat -- the old contempt personality), Peanut
(chihuahua), Tank (horse), Barbara (goat), Noodle (snake). Everything but Hayley and Koba is
Claude-designed; Frank has veto.

**Back-compat:** app builds 1.0 (1)-(12) send species ids (`cat`). `resolveAnimal()` maps each to
its species' default character and flags it `legacy`, so those builds get the character's
personality but addressed as "the cat" -- never a name their UI doesn't show. The app rewrites
saved chats' species ids to character ids on load (`migrateAnimals` in `lib/chats.ts`).

**Deploy order:** build 12 is under App Review against production, so this server change is on
foundry only. Once 12 is approved: deploy the server to Hetzner (old builds keep working via the
legacy mapping), then cut build 13 -- a character-id build can't go out before production knows
the ids. Build 13 also needs: regenerated App Store screenshots (names now show in the picker and
placeholder) and review notes updated from "horse, goat and snake" to the new bonus roster.

## Memory (2026-09-23) -- on foundry with characters; same deploy hold
Each character remembers things about the person across all chats with them, shaped by
personality -- the joke is animals remembering the *wrong* things (Koba forgets your name but never
a broken walk promise; Gerald keeps a bread ledger; Kevin remembers nothing, by design).
- **Mechanism:** the reply JSON gets an optional `remember` note, requested only when the app sends
  a `memory` array (older builds never do, so their prompt is unchanged). The app keeps notes per
  character in localStorage (`lib/memory.ts`, key `aineko.memories.v1`, last 12 per character) and
  sends them with every message to that character. Device-local like chats -- the server stores
  nothing, which keeps the privacy policy true (its text was updated to say memories are sent and
  kept on-device). Per-character `remembers` text lives in `server/src/animals.ts` (null = none).
- **UI:** "Koba will remember: ..." under a reply that created a note; Settings > What they
  remember lists every note and has Forget everything. Consent sheet text mentions memories.
- **Tuning, measured (`server/scripts/memory-callbacks.mts`):** with the memory list up in the
  system prompt the model almost never used it (2/20 next-day callbacks). Moving the list into a
  bracketed "[Koba remembers: ...]" note right before the latest message, plus wording that asks for
  memories to show in behavior "especially at a greeting", got ~15/20. Invented notes during
  ordinary chat: 0/20. The model re-issues existing memories reworded, so `src/memory-notes.ts`
  drops a note whose meaningful words mostly overlap an existing one (tested with the real
  rewordings it produced). Don't put a concrete example note in the prompt -- the model copied it
  verbatim before the event had even happened.
- **Cost:** up to ~12 short notes (~100-250 tokens) on top of history; allowances are token-
  denominated so worst-case dollars don't move, messages-per-allowance drop a bit.

## Custom animals (2026-09-23, members) -- on foundry; TestFlight build 1.0 (13) points at foundry
Members make their own animals: species, name, she/he/it, four 5-step sliders (energy,
friendliness, appetite, drama), up to two quirks from a fixed list. **No free-form prompt** (Frank
agreed): the server writes every word from those choices (`server/src/custom.ts` -- slider
sentences, quirk sentences, an adjective line like "a hyper, clingy dog", species-default
vocabulary/triggers). The only user text that reaches the model is the name, validated to
`CUSTOM_NAME` (letters/digits/space/'.- , 20 max). Rejected-input cases are in
`test/custom.test.mts`.
- Stored on-device (`mobile/src/lib/custom-animals.ts`, key `aineko.customAnimals.v1`); every
  request to one carries its full spec as `custom`, and history items for one carry its name and
  species (the server keeps no record of them). Ids `custom-<16 hex>`. Quirk ids and the name rule
  must match between the two files.
- Members-only on the server (`membersOnly: true` on every custom). Picker: "Your animals" group
  with "+ Make your own..."; Settings > Your animals (edit / delete). Delete is soft so old
  messages still render; chats pointed at it fall back to Hayley.
- Memory works for them unchanged (keyed by id).
- **Testing the editor in a browser** needs membership, which a browser can't have. The UI test
  fakes it in the test browser only -- `window.CapacitorCustomPlatform = {name: "ios"}` plus
  patching the purchase plugin's web fallback (`getPurchases` returns `{purchases:[]}`) to report
  an active subscription. No test hooks in the app. The server still refuses that fake
  membership, which doubles as a check of the server-side gate.

**Build 1.0 (13) is a TestFlight-only build pointed at foundry's tailnet server**, so Frank can try
characters + memory + custom animals while build 12 is still in App Review against production
(production can't take these server changes mid-review). Never submit 13. The Mac's
`.env.local` was switched to the tailnet values for it and switched back to production right after
(production values saved at `~/aineko-build/env.local.production` on the Mac). The first build
submitted with these features must be built against production after the Hetzner deploy.

**Build 1.0 (14), same arrangement (TestFlight-only, foundry):** fixes from Frank's first look at
13. (1) The editor sheet drifted sideways on iOS -- a vertical-only scroll area lets iOS pan
horizontally too, and slider knobs at the ends overhang the track. Locked (`overflow-x: hidden`,
`touch-action: pan-y`) and compacted to fit a phone without scrolling (measured: 375x667,
390x844, 430x932 all fit, no overflow either way). (2) Settings > What they remember only iterated
the built-in roster, so custom animals' notes were saved but never listed; now lists everything
stored, and deleting a custom animal deletes its memories. Browser demo and the app keep
separate memories (separate storage) -- a note made on the tailnet browser demo won't show in the
app.
