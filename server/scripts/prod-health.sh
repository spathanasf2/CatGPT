#!/usr/bin/env bash
# Aineko production health, run every 5 minutes on foundry by aineko-prod-health.timer (system
# units, installed from server/scripts/systemd/). A failure exits non-zero and the unit's OnFailure
# hook pushes it to Frank's Telegram through the box's existing alert path
# (cli-games-telegram-notify@). The exit code in the alert says what broke:
#   10  aineko.bromsg.com/health isn't answering ok (server, container, Caddy or Cloudflare)
#   11  the OpenRouter key's monthly cap is nearly spent -- when it runs out, every chat fails
#   12  the OpenRouter account's credit is nearly gone
# The same failure alerts once, then again every 6 hours while it lasts; recovery clears it.
# Needs OPENROUTER_API_KEY (the unit loads server/.env -- same key as production).
set -uo pipefail

HEALTH_URL=${HEALTH_URL:-https://aineko.bromsg.com/health}
KEY_MIN_USD=${KEY_MIN_USD:-5}       # of the key's $50/month cap
ACCOUNT_MIN_USD=${ACCOUNT_MIN_USD:-10}
REALERT_SECONDS=$((6 * 3600))
STATE_DIR=${STATE_DIR:-$HOME/.local/state/aineko-health}
mkdir -p "$STATE_DIR"

code=0
why=""
if ! curl -fsS -m 20 "$HEALTH_URL" | grep -q '"ok":true'; then
  code=10
  why="health check failed: $HEALTH_URL"
elif [[ -n ${OPENROUTER_API_KEY:-} ]]; then
  # OpenRouter being unreachable isn't our outage -- only alert on numbers we actually got.
  money=$(curl -fsS -m 20 https://openrouter.ai/api/v1/key -H "Authorization: Bearer $OPENROUTER_API_KEY" 2>/dev/null |
    python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]; r=d.get("limit_remaining"); print("" if r is None else r)' 2>/dev/null)
  credit=$(curl -fsS -m 20 https://openrouter.ai/api/v1/credits -H "Authorization: Bearer $OPENROUTER_API_KEY" 2>/dev/null |
    python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]; print(d["total_credits"]-d["total_usage"])' 2>/dev/null)
  if [[ -n $money ]] && python3 -c "import sys; sys.exit(0 if $money < $KEY_MIN_USD else 1)"; then
    code=11
    why="OpenRouter key has \$$money left of its monthly cap"
  elif [[ -n $credit ]] && python3 -c "import sys; sys.exit(0 if $credit < $ACCOUNT_MIN_USD else 1)"; then
    code=12
    why="OpenRouter account credit is down to \$$credit"
  fi
fi

now=$(date +%s)
if [[ $code == 0 ]]; then
  [[ -f $STATE_DIR/last ]] && echo "recovered (was: $(cat "$STATE_DIR/last"))"
  rm -f "$STATE_DIR/last"
  echo "ok"
  exit 0
fi
if [[ -f $STATE_DIR/last ]]; then
  read -r last_code last_at _ < "$STATE_DIR/last"
  if [[ $last_code == "$code" && $((now - last_at)) -lt $REALERT_SECONDS ]]; then
    echo "still failing, alert throttled: $why"
    exit 0
  fi
fi
echo "$code $now $why" > "$STATE_DIR/last"
echo "FAIL ($code): $why"
exit $code
