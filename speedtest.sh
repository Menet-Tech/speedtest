#!/usr/bin/env bash

# speedtest.sh – Clean service controller (frontend + backend + node)
# Ports:
#   Frontend = 8080
#   Backend  = 3000
#   Node     = 8081

set -euo pipefail

BASE_DIR="$(pwd)"
PIDFILE="$BASE_DIR/.speedtest.pids"

FRONTEND_PORT=8080
BACKEND_PORT=3000
NODE_PORT=8081

CMD="${1:-start}"

# ------------------------------------------------------------
# Load .env if exists
# ------------------------------------------------------------
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# ------------------------------------------------------------
# Kill process by port (safety)
# ------------------------------------------------------------
kill_port() {
  local port=$1
  lsof -ti:$port | xargs -r kill -9 2>/dev/null || true
}

# ------------------------------------------------------------
# Stop services
# ------------------------------------------------------------
stop_services() {
  echo "Stopping Speedtest services..."

  if [ -f "$PIDFILE" ]; then
    source "$PIDFILE"

    [ -n "${BACKEND_PID:-}" ] && kill -9 "$BACKEND_PID" 2>/dev/null || true
    [ -n "${FRONTEND_PID:-}" ] && kill -9 "$FRONTEND_PID" 2>/dev/null || true
    [ -n "${NODE_PID:-}" ] && kill -9 "$NODE_PID" 2>/dev/null || true

    rm -f "$PIDFILE"
  fi

  # extra safety kill by port
  kill_port $BACKEND_PORT
  kill_port $FRONTEND_PORT
  kill_port $NODE_PORT

  echo "All services stopped."
}

# ------------------------------------------------------------
# Start services
# ------------------------------------------------------------
start_services() {
  echo "Starting Speedtest services..."

  # safety kill old ports
  kill_port $BACKEND_PORT
  kill_port $FRONTEND_PORT
  kill_port $NODE_PORT

  # ---------------- Backend ----------------
  echo "Starting backend on port $BACKEND_PORT..."
  BACKEND_PORT=$BACKEND_PORT ./speedtest-backend &
  BACKEND_PID=$!
  echo "Backend PID=$BACKEND_PID"

  # ---------------- Frontend ----------------
  echo "Starting frontend on port $FRONTEND_PORT..."
  serve -s frontend/dist -l $FRONTEND_PORT &
  FRONTEND_PID=$!
  echo "Frontend PID=$FRONTEND_PID"

  # ---------------- Node ----------------
  if [ -f node/main.js ]; then
    echo "Starting node on port $NODE_PORT..."
    PORT=$NODE_PORT node node/main.js &
    NODE_PID=$!
    echo "Node PID=$NODE_PID"
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
  echo "Services started:"
  echo "Frontend: http://localhost:$FRONTEND_PORT"
  echo "Backend : http://localhost:$BACKEND_PORT"
  echo "Node    : http://localhost:$NODE_PORT"

  trap "stop_services; exit" SIGINT SIGTERM

  wait $BACKEND_PID
  wait $FRONTEND_PID
  if [ -n "$NODE_PID" ]; then
    wait $NODE_PID
  fi
}

# ------------------------------------------------------------
# Command router
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