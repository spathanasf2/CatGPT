# Message guard

Added 2026-10-23, on Frank's call: keep abusive input away from the OpenRouter account, the same
containment CLI-Games' Clide got the same day. Server-only; works with every app build already
shipped.

## What it does

Every `POST /chat` is screened before the animal's model sees anything:

- **The person's own words**, meaning the typed message and the name of a custom animal they made,
  go to Llama Guard 4 (`meta-llama/llama-guard-4-12b`) on OpenRouter. If the guard flags violent
  crime, sex crimes, child sexual exploitation, weapons of mass harm, hate or sexual content (S1,
  S3, S4, S9, S10, S12), the request is refused and counts as a strike. A chatroom sends one
  message once per animal, so strikes within 2 minutes of each other count once.
- **What the device sends back** (history, memory notes, the open promise, roommates) is checked
  as a second, parallel call. A flag there, or a failed check, drops it from this request's prompt
  and costs no strike.
- **Three strikes in 24 hours** lock the caller for 24 hours, then 7 days, then for good. A
  ladder lapses 90 days after its last timed lockout ends.
- **Child sexual exploitation (S4)** is one strike, never an instant lockout, because the guard
  cannot tell abuse from a child disclosing it (Frank, 2026-10-23). The reply always offers a
  trusted adult and Childhelp (1-800-422-4453, call or text), plus the self-harm help when S11 is
  also flagged, and Frank is alerted at once.
- **Self-harm (S11)** is never a strike. The reply points to someone they trust, 988 in the US, and
  findahelpline.com elsewhere.
- **Codes not in the enforced set** (non-violent crime, advice and the rest) pass.
- **The guard fails closed.** If it cannot answer, `/chat` returns 503, which the app shows as "didn't
  answer, try again".

The caller is the metering key from `resolveCaller` in `server/src/index.ts`: `member:` follows a
subscription, `install:` an app install (a reinstall starts fresh). Only builds 1.0 (1)-(9), which
send no install ID, are keyed on `ip:`. The IP backstop key that also meters free installs is never
locked.

**Replies, not errors.** A refusal, a lockout or the help text is returned as an ordinary
`{sounds, narrative}` reply, e.g. `*Biscuit turns away and won't answer that.*`, because shipped
builds would show any new error code as "something went wrong on our end". A custom animal is
named by its species in these replies ("the bunny"), so a flagged name is never repeated back.

## Privacy

The privacy policy promises we never log or store messages, and that still holds.
`server/src/strikes.ts` keeps only codes, timestamps, counts and an 8-character anonymized tag per
key (`tagFor`). The privacy and Acceptable Use pages describe the check and the pause ladder
(updated 2026-10-23). The guard's own request goes to OpenRouter like the chat request does.

## Files and settings

- `server/src/guard.ts` classifies. `GUARD_API_KEY` (a separately capped key) wins when it is set;
  otherwise it falls back to `OPENROUTER_API_KEY`. `GUARD_MODEL` and `GUARD_URL` override the
  defaults.
- `server/src/strikes.ts` holds the ladder and the event list in `guard.json` next to `usage.json`
  (on Hetzner, `~/services/aineko-data/guard.json`), or at `GUARD_FILE`. Every change is fsynced
  and renamed into place, with the previous good copy kept as `guard.json.bak`. The file is reread
  when it changes on disk, so a lift needs no restart. A file that will not parse is moved aside
  to `guard.json.corrupt-<time>` and the backup is loaded; it is never overwritten.
- `server/src/screen.ts` turns a verdict into a reply, and holds the reply copy.
- `server/src/guard-cli.ts` is the moderator's tool:
  - `ssh hetzner docker exec aineko node dist/guard-cli.js events` lists recent events.
  - `ssh hetzner docker exec aineko node dist/guard-cli.js lift <tag>` lifts a false positive and
    takes it off the ladder.

## Alerts

`server/scripts/guard-alerts.sh` runs as `ExecStartPre` of `aineko-prod-health.service` (every 5
minutes on foundry, as noderunner). It reads production's `guard.json` over `ssh hetzner` and sends
each new lockout, child-abuse flag or self-harm flag to Frank's Telegram through
`~/scripts/squawk-alert.sh`. Alerts carry the tier, the tag, the codes and the lift command, never
text. The very first run only records the latest event number. A missing `guard.json` counts as
event 0, so the first event ever is alerted, and a server whose numbering went backwards (a reset
state) has everything it holds alerted. Child-abuse and self-harm flags alert once per caller per
day at most. Every step is time-bounded, and the unit's timeout covers both scripts.

After changing the unit file: `sudo install -m 644 server/scripts/systemd/aineko-prod-health.service
/etc/systemd/system/ && sudo systemctl daemon-reload`.
