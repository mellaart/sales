#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${SALES_APP_DIR:-/hosting/sales.troublefree.nl/apps/sales}"
LOG_DIR="${SALES_LOG_DIR:-/hosting/sales.troublefree.nl/logs}"
CRON_LOG="${SALES_MAILCHIMP_CRON_LOG:-$LOG_DIR/sales-mailchimp-nightly.log}"
SECRET_FILE="${SALES_MAILCHIMP_CRON_SECRET_FILE:-$APP_DIR/.mailchimp-cron-secret}"
START_MARKER="# BEGIN SMART TRADE NIGHTLY MAILCHIMP"
END_MARKER="# END SMART TRADE NIGHTLY MAILCHIMP"

if ! command -v crontab >/dev/null 2>&1; then
  printf '%s\n' "Crontab is niet beschikbaar; Mailchimp is niet automatisch ingepland." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
umask 077
if [ ! -s "$SECRET_FILE" ]; then
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32 > "$SECRET_FILE"
  else
    head -c 48 /dev/urandom | base64 | tr -d '\r\n' > "$SECRET_FILE"
    printf '\n' >> "$SECRET_FILE"
  fi
fi
chmod 600 "$SECRET_FILE"

CURRENT_CRONTAB="$(crontab -l 2>/dev/null || true)"
CLEAN_CRONTAB="$({
  printf '%s\n' "$CURRENT_CRONTAB" \
    | awk -v start="$START_MARKER" -v end="$END_MARKER" '
        $0 == start { skip = 1; next }
        $0 == end { skip = 0; next }
        !skip { print }
      '
})"

{
  printf '%s\n' "$CLEAN_CRONTAB"
  printf '%s\n' "$START_MARKER"
  printf '%s\n' "CRON_TZ=Europe/Amsterdam"
  printf '%s\n' "0 4 * * * /bin/bash $APP_DIR/scripts/run-nightly-mailchimp-sync.sh >> $CRON_LOG 2>&1"
  printf '%s\n' "$END_MARKER"
} | sed '/^[[:space:]]*$/N;/^\n$/D' | crontab -

printf '%s\n' "Mailchimp-synchronisatie ingepland om 04:00 uur (Europe/Amsterdam)."
