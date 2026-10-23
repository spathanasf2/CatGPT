#!/usr/bin/env bash
# Aineko message-guard alerts, run before prod-health.sh by aineko-prod-health.service (every 5
# minutes on foundry). Reads production's guard state (server/src/strikes.ts) over ssh and sends
# every event since the last run -- lockouts and self-harm flags -- to Frank's Telegram through
# ~/scripts/squawk-alert.sh (Knox bot, email fallback). The state holds codes, times and anonymized
# tags only, never message text, so neither does an alert. Never fails the unit: a missed read is
# retried next run, since events are numbered.
#   GUARD_SOURCE  read this local file instead of ssh (tests)
set -uo pipefail

REMOTE=${GUARD_REMOTE:-hetzner}
REMOTE_FILE=${GUARD_REMOTE_FILE:-services/aineko-data/guard.json}
ALERT=${ALERT:-$HOME/scripts/squawk-alert.sh}
STATE_DIR=${STATE_DIR:-$HOME/.local/state/aineko-health}
mkdir -p "$STATE_DIR"
seq_file=$STATE_DIR/guard-seq

if [[ -n ${GUARD_SOURCE:-} ]]; then
  json=$(cat "$GUARD_SOURCE" 2>/dev/null) || json=""
else
  json=$(ssh -o BatchMode=yes -o ConnectTimeout=15 "$REMOTE" cat "$REMOTE_FILE" 2>/dev/null) || json=""
fi
if [[ -z $json ]]; then
  # No file means nothing has ever been flagged; an unreachable host is prod-health's to report.
  echo "guard: no state read"
  exit 0
fi

last=$(cat "$seq_file" 2>/dev/null || echo "")
out=$(GUARD_JSON=$json LAST_SEQ=$last python3 - <<'PY'
import json, os, time
state = json.loads(os.environ["GUARD_JSON"])
events = state.get("events", [])
top = max([e["seq"] for e in events] + [state.get("seq", 0)])
last = os.environ["LAST_SEQ"]
lines = []
if last != "":  # the first run only records where we are
    for e in events:
        if e["seq"] <= int(last):
            continue
        codes = ", ".join(e.get("categories", []))
        who = f'{e.get("tier", "?")} {e["tag"]}'
        if e["kind"] == "lockout":
            until = e.get("until")
            span = "for good" if until == "indefinite" else "until " + time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime(until / 1000))
            reason = "child sexual exploitation" if e.get("severe") else "3 flagged messages in 24 hours"
            lines.append(f"Aineko lockout ({who}): {reason} ({codes}), {span}. Lift: ssh hetzner docker exec aineko node dist/guard-cli.js lift {e['tag']}")
        elif e["kind"] == "help":
            lines.append(f"Aineko self-harm flag ({who}, {codes}): help reply sent, no action taken.")
print(top)
print("\n".join(lines))
PY
) || { echo "guard: state unreadable"; exit 0; }

top=$(head -n 1 <<<"$out")
message=$(tail -n +2 <<<"$out")
if [[ -n $message ]]; then
  if "$ALERT" "$message"; then
    echo "$top" > "$seq_file"
    echo "guard: alerted"
  else
    # squawk-alert exit 2 = delivered by email; anything else, try again next run.
    [[ $? == 2 ]] && echo "$top" > "$seq_file"
    echo "guard: alert delivery failed or fell back"
  fi
else
  echo "$top" > "$seq_file"
  echo "guard: nothing new"
fi
exit 0
