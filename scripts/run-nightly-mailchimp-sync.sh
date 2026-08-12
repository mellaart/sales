#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${SALES_APP_DIR:-/hosting/sales.troublefree.nl/apps/sales}"
PORT="${SALES_PORT:-3007}"
SECRET_FILE="${SALES_MAILCHIMP_CRON_SECRET_FILE:-$APP_DIR/.mailchimp-cron-secret}"
LOCK_DIR="${SALES_MAILCHIMP_CRON_LOCK_DIR:-/tmp/sales-mailchimp-nightly.lock}"

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "Mailchimp-synchronisatie is al bezig; deze uitvoering wordt overgeslagen."
  exit 0
fi

cleanup() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT

if [ ! -s "$SECRET_FILE" ]; then
  log "Geheime sleutel ontbreekt: $SECRET_FILE"
  exit 1
fi

SECRET="$(tr -d '\r\n' < "$SECRET_FILE")"
if [ -z "$SECRET" ]; then
  log "Geheime sleutel is leeg: $SECRET_FILE"
  exit 1
fi

log "Nachtelijke Mailchimp-synchronisatie gestart."
RESPONSE_FILE="$(mktemp)"
trap 'rm -f "$RESPONSE_FILE"; cleanup' EXIT

HTTP_STATUS="$(
  curl --silent --show-error --max-time 1800 \
    --output "$RESPONSE_FILE" \
    --write-out '%{http_code}' \
    --request POST \
    --header "Authorization: Bearer $SECRET" \
    "http://127.0.0.1:$PORT/api/internal/mailchimp-sync"
)" || {
  STATUS=$?
  RESPONSE="$(cat "$RESPONSE_FILE" 2>/dev/null || true)"
  log "Nachtelijke Mailchimp-synchronisatie mislukt (exit $STATUS): $RESPONSE"
  exit "$STATUS"
}

RESPONSE="$(cat "$RESPONSE_FILE")"
if [ "$HTTP_STATUS" -lt 200 ] || [ "$HTTP_STATUS" -ge 300 ]; then
  log "Nachtelijke Mailchimp-synchronisatie mislukt (HTTP $HTTP_STATUS): $RESPONSE"
  exit 1
fi

log "Nachtelijke Mailchimp-synchronisatie afgerond: $RESPONSE"
