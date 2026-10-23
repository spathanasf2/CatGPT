#!/usr/bin/env bash
# Aineko message-guard alerts, run before prod-health.sh by aineko-prod-health.service (every 5
# minutes on foundry). Reads production's guard state (server/src/strikes.ts) over ssh and sends
# every event since the last run -- lockouts, self-harm and child-abuse flags -- to Frank's
# Telegram through ~/scripts/squawk-alert.sh (Knox bot, email fallback). The state holds codes,
# times and anonymized tags only, never message text, so neither does an alert. Never fails the
# unit, and every step is time-bounded so it cannot run the unit into its timeout. Events are
# numbered, so a missed read or a failed delivery is retried next run.
#   GUARD_SOURCE  read this local file instead of ssh (tests); a missing file reads as no events
set -uo pipefail

REMOTE=${GUARD_REMOTE:-hetzner}
REMOTE_FILE=${GUARD_REMOTE_FILE:-services/aineko-data/guard.json}
ALERT=${ALERT:-$HOME/scripts/squawk-alert.sh}
STATE_DIR=${STATE_DIR:-$HOME/.local/state/aineko-health}
mkdir -p "$STATE_DIR"
seq_file=$STATE_DIR/guard-seq
EMPTY='{"seq":0,"events":[]}'

# A missing file on a host that answered means nothing has been flagged yet; that is a baseline of
# 0, so the very first event is alerted. An empty read means the host did not answer.
if [[ -n ${GUARD_SOURCE:-} ]]; then
  json=$(cat "$GUARD_SOURCE" 2>/dev/null || echo "$EMPTY")
else
  json=$(timeout 25 ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=2 \
    "$REMOTE" "cat $REMOTE_FILE 2>/dev/null || echo '$EMPTY'" 2>/dev/null) || json=""
fi
if [[ -z $json ]]; then
  echo "guard: production did not answer; retrying next run"
  exit 0
fi

last=$(cat "$seq_file" 2>/dev/null || echo "")
out=$(GUARD_JSON=$json LAST_SEQ=$last python3 - <<'PY'
import json, os, time
state = json.loads(os.environ["GUARD_JSON"])
events = state.get("events", [])
top = max([e["seq"] for e in events] + [state.get("seq", 0)])
last = os.environ["LAST_SEQ"].strip()
if last == "":
    since = None            # first run ever: record where we are, alert nothing
elif top < int(last):
    since = 0               # the server's state was reset: everything it holds is new
else:
    since = int(last)
lines = []
for e in events if since is not None else []:
    if e["seq"] <= since:
        continue
    codes = ", ".join(e.get("categories", []))
    who = f'{e.get("tier", "?")} {e["tag"]}'
    if e["kind"] == "lockout":
        until = e.get("until")
        span = "for good" if until == "indefinite" else "until " + time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime(until / 1000))
        lines.append(f"Aineko lockout ({who}): 3 flagged messages in 24 hours ({codes}), {span}. Lift: ssh hetzner docker exec aineko node dist/guard-cli.js lift {e['tag']}")
    elif e["kind"] == "abuse":
        lines.append(f"Aineko child-abuse flag ({who}, {codes}): could be abuse or a child disclosing it. Help reply sent, counted as a strike.")
    elif e["kind"] == "help":
        lines.append(f"Aineko self-harm flag ({who}, {codes}): help reply sent, no action taken.")
print(top)
print("\n".join(lines))
PY
) || { echo "guard: state unreadable"; exit 0; }

top=$(head -n 1 <<<"$out")
message=$(tail -n +2 <<<"$out")

record() {
  printf '%s\n' "$top" > "$seq_file.tmp" && mv -f "$seq_file.tmp" "$seq_file"
}

if [[ -z $message ]]; then
  record
  echo "guard: nothing new"
  exit 0
fi
timeout 60 "$ALERT" "$message"
status=$?
# squawk-alert: 0 = Telegram, 2 = email fallback (both delivered); anything else, retry next run.
if [[ $status == 0 || $status == 2 ]]; then
  record
  echo "guard: alerted ($status)"
else
  echo "guard: alert not delivered ($status); retrying next run"
fi
exit 0
