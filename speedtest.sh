#!/usr/bin/env bash

# Speedtest Control Script (SAFE VERSION)
# - Anti double run (LOCK FILE)
# - Clean stop/start
# - No ghost process
# - Fixed ports:
#   Frontend = 8080
#   Backend  = 3000
#   Node     = 8081

set -euo pipefail

BASE_DIR="$(pwd)"
PIDFILE="$BASE_DIR/.speedtest.pids"
LOCKFILE="/tmp/speedtest.lock"

FRONTEND_PORT=8080
BACKEND_PORT=3000
NODE_PORT=8081

CMD="${1:-start}"

# ------------------------------------------------------------
# Load .env
# ------------------------------------------------------------
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# ------------------------------------------------------------
# Safety kill by port
# ------------------------------------------------------------
kill_port() {
  lsof -ti:$1 | xargs -r kill -9 2>/dev/null || true
}

# ------------------------------------------------------------
# STOP SERVICES
# ------------------------------------------------------------
stop_services() {
  echo "Stopping Speedtest services..."

  # remove lock
  rm -f "$LOCKFILE"

  # kill by PID file
  if [ -f "$PIDFILE" ]; then
    source "$PIDFILE"

    [ -n "${BACKEND_PID:-}" ] && kill -9 "$BACKEND_PID" 2>/dev/null || true
    [ -n "${FRONTEND_PID:-}" ] && kill -9 "$FRONTEND_PID" 2>/dev/null || true
    [ -n "${NODE_PID:-}" ] && kill -9 "$NODE_PID" 2>/dev/null || true

    rm -f "$PIDFILE"
  fi

  # hard cleanup (anti ghost)
  pkill -f speedtest-backend || true
  pkill -f "serve -s" || true
  pkill -f "node node/main.js" || true

  # kill ports
  kill_port $BACKEND_PORT
  kill_port $FRONTEND_PORT
  kill_port $NODE_PORT

  echo "All services stopped."
}

# ------------------------------------------------------------
# START SERVICES
# ------------------------------------------------------------
start_services() {

  # anti double run lock
  if [ -f "$LOCKFILE" ]; then
    echo "ERROR: Speedtest already running!"
    exit 1
  fi

  touch "$LOCKFILE"

  echo "Starting Speedtest services..."

  # Ensure no existing services occupy the ports
  kill_port $BACKEND_PORT
  kill_port $FRONTEND_PORT
  kill_port $NODE_PORT

  # ---------------- BACKEND ----------------
  echo "Starting backend on port $BACKEND_PORT..."
  PORT=$BACKEND_PORT ./speedtest-backend &
  BACKEND_PID=$!

  # ---------------- FRONTEND ----------------
  echo "Starting frontend on port $FRONTEND_PORT..."
  serve -s frontend/dist -l $FRONTEND_PORT &
  FRONTEND_PID=$!

  # ---------------- NODE ----------------
  if [ -f node/main.js ]; then
    echo "Starting node on port $NODE_PORT..."
    PORT=$NODE_PORT node node/main.js &
    NODE_PID=$!
  else
    NODE_PID=""
  fi

  # save PID
  cat > "$PIDFILE" <<EOF
BACKEND_PID=$BACKEND_PID
FRONTEND_PID=$FRONTEND_PID
NODE_PID=$NODE_PID
EOF

  echo ""
  echo "=============================="
  echo "Speedtest Started"
  echo "Frontend: http://localhost:$FRONTEND_PORT"
  echo "Backend : http://localhost:$BACKEND_PORT"
  echo "Node    : http://localhost:$NODE_PORT"
  echo "=============================="

  trap "stop_services; exit" SIGINT SIGTERM

  wait $BACKEND_PID
  wait $FRONTEND_PID
  if [ -n "$NODE_PID" ]; then
    wait $NODE_PID
  fi
}

# ------------------------------------------------------------
# COMMAND ROUTER
# ------------------------------------------------------------
case "$CMD" in
  start)
    start_services
    ;;
  stop)
    stop_services
    ;;
  restart)
    stop_services
    start_services
    ;;
  *)
    echo "Usage: $0 {start|stop|restart}"
    exit 1
    ;;
esac