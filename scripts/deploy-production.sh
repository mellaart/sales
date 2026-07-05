#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${SALES_APP_DIR:-/hosting/sales.troublefree.nl/apps/sales}"
BRANCH="${SALES_BRANCH:-main}"
REMOTE="${SALES_REMOTE:-origin}"
PORT="${SALES_PORT:-3007}"
LOG_DIR="${SALES_LOG_DIR:-/hosting/sales.troublefree.nl/logs}"
DEPLOY_LOG="${SALES_DEPLOY_LOG:-$LOG_DIR/sales-deploy.log}"
APP_LOG="${SALES_APP_LOG:-$LOG_DIR/sales-next.log}"
PID_FILE="${SALES_PID_FILE:-$APP_DIR/.next-server.pid}"
LOCK_DIR="${SALES_DEPLOY_LOCK_DIR:-/tmp/sales-deploy.lock}"

log() {
  printf "%s %s\n" "$(date "+%Y-%m-%d %H:%M:%S")" "$*" | tee -a "$DEPLOY_LOG"
}

mkdir -p "$LOG_DIR"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "Deploy is al bezig."
  exit 0
fi

cleanup() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT

cd "$APP_DIR"

CURRENT_COMMIT="$(git rev-parse HEAD)"
git fetch "$REMOTE" "$BRANCH"
REMOTE_COMMIT="$(git rev-parse "$REMOTE/$BRANCH")"

if [ "$CURRENT_COMMIT" = "$REMOTE_COMMIT" ]; then
  log "Geen nieuwe versie ($CURRENT_COMMIT)."
  exit 0
fi

log "Nieuwe versie gevonden: $CURRENT_COMMIT -> $REMOTE_COMMIT"

git checkout "$BRANCH"
git pull --ff-only "$REMOTE" "$BRANCH"
npm install --no-package-lock
npm run build

stop_app() {
  if [ -f "$PID_FILE" ]; then
    PID="$(cat "$PID_FILE" 2>/dev/null || true)"

    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      log "Stop bestaande app via pid file: $PID"
      kill "$PID" 2>/dev/null || true

      for _ in 1 2 3 4 5 6 7 8 9 10; do
        if ! kill -0 "$PID" 2>/dev/null; then
          break
        fi
        sleep 1
      done

      if kill -0 "$PID" 2>/dev/null; then
        log "Forceer stop app: $PID"
        kill -9 "$PID" 2>/dev/null || true
      fi
    fi
  fi

  PORT_PIDS="$(
    ss -ltnp 2>/dev/null \
      | awk -v port=":$PORT" '$4 ~ port { print }' \
      | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' \
      | sort -u || true
  )"

  if [ -n "$PORT_PIDS" ]; then
    for PID in $PORT_PIDS; do
      log "Stop proces op poort $PORT: $PID"
      kill "$PID" 2>/dev/null || true
    done
    sleep 2
  fi
}

start_app() {
  log "Start app op poort $PORT"
  nohup env PORT="$PORT" npm run start > "$APP_LOG" 2>&1 &
  echo "$!" > "$PID_FILE"
  sleep 3

  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -z "$PID" ] || ! kill -0 "$PID" 2>/dev/null; then
    log "Start mislukt. Bekijk $APP_LOG"
    exit 1
  fi

  if command -v curl >/dev/null 2>&1; then
    if curl -fsS "http://127.0.0.1:$PORT" >/dev/null; then
      log "Deploy klaar: $(git rev-parse --short HEAD)"
      exit 0
    fi

    log "App gestart, maar healthcheck geeft geen OK. Bekijk $APP_LOG"
    exit 1
  fi

  log "Deploy klaar: $(git rev-parse --short HEAD)"
}

stop_app
start_app
