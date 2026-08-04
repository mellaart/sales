#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${SALES_APP_DIR:-/hosting/sales.troublefree.nl/apps/sales}"
LOG_DIR="${SALES_LOG_DIR:-/hosting/sales.troublefree.nl/logs}"
CRON_LOG="${SALES_WEEKLY_DEALS_LOG:-$LOG_DIR/sales-weekly-deals.log}"
START_MARKER="# BEGIN SMART TRADE WEEKLY OPEN DEALS"
END_MARKER="# END SMART TRADE WEEKLY OPEN DEALS"

if ! command -v crontab >/dev/null 2>&1; then
  printf '%s\n' "Crontab is niet beschikbaar; de wekelijkse dealmail is niet ingepland." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
CURRENT_CRONTAB="$(crontab -l 2>/dev/null || true)"
CLEAN_CRONTAB="$(
  printf '%s\n' "$CURRENT_CRONTAB" \
    | awk -v start="$START_MARKER" -v end="$END_MARKER" '
        $0 == start { skip = 1; next }
        $0 == end { skip = 0; next }
        !skip { print }
      '
)"

{
  printf '%s\n' "$CLEAN_CRONTAB"
  printf '%s\n' "$START_MARKER"
  printf '%s\n' "CRON_TZ=Europe/Amsterdam"
  printf '%s\n' "0 8 * * 1 /bin/bash $APP_DIR/scripts/run-weekly-open-deals.sh >> $CRON_LOG 2>&1"
  printf '%s\n' "$END_MARKER"
} | sed '/^[[:space:]]*$/N;/^\n$/D' | crontab -

printf '%s\n' "Wekelijkse dealmail ingepland op maandag om 08:00 uur (Europe/Amsterdam)."
