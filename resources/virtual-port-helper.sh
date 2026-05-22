#!/usr/bin/env bash
set -euo pipefail

CMD="${1:-}"
ID="${2:-}"
LEFT_PATH="${3:-}"
RIGHT_PATH="${4:-}"
MODE="${5:-}"
EXTRA_OPTS="${6:-}"

LOG_FILE="/run/virtual-port-linux-${ID}.log"

if [[ -z "$ID" ]]; then
  echo "missing pair id"
  exit 10
fi

PID_FILE="/run/virtual-port-linux-${ID}.pid"

is_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]]; then
      # kill -0 without sudo returns permission denied for root processes
      if [[ -d "/proc/$pid" ]] || ps -p "$pid" >/dev/null 2>&1; then
        echo "$pid"
        return 0
      fi
    fi
  fi
  return 1
}

case "$CMD" in
  start)
    SOCAT_BIN="$(command -v socat || true)"
    if [[ -z "$SOCAT_BIN" ]]; then
      echo "socat not found in PATH"
      exit 2
    fi

    if is_running >/dev/null; then
      echo "already running"
      exit 3
    fi

    if [[ -z "$LEFT_PATH" || -z "$RIGHT_PATH" || -z "$MODE" ]]; then
      echo "missing arguments"
      exit 4
    fi

    LEFT_ARG="pty,raw,echo=0,mode=${MODE},link=${LEFT_PATH}"
    RIGHT_ARG="pty,raw,echo=0,mode=${MODE},link=${RIGHT_PATH}"

    if [[ -n "$EXTRA_OPTS" && "$EXTRA_OPTS" != "-" ]]; then
      LEFT_ARG+="${EXTRA_OPTS}"
      RIGHT_ARG+="${EXTRA_OPTS}"
    fi

    nohup "$SOCAT_BIN" -d -d "$LEFT_ARG" "$RIGHT_ARG" >>"$LOG_FILE" 2>&1 &
    echo "$!" > "$PID_FILE"
    echo "started"
    ;;
  stop)
    if ! is_running >/dev/null; then
      echo "not running"
      exit 5
    fi

    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]]; then
      kill "$pid" || true
    fi
    rm -f "$PID_FILE"
    echo "stopped"
    ;;
  status)
    if pid="$(is_running)"; then
      echo "running:$pid"
      exit 0
    fi
    echo "stopped"
    exit 0
    ;;
  *)
    echo "usage: $0 {start|stop|status} <id> [args]"
    exit 1
    ;;
esac
