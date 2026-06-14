#!/usr/bin/env bash

# speedtest.sh – Control wrapper for Speedtest application on Ubuntu 24.04
# ----------------------------------------------------------------------
# Usage: ./speedtest.sh start|stop|restart
#   start   – Build (if needed) and launch backend, frontend and optional node service.
#   stop    – Terminate all running processes started by this script.
#   restart – Stop then start again.
#
# The script stores PIDs of the launched processes in a temporary file
# (${PWD}/.speedtest.pids) so that they can be stopped safely.

set -euo pipefail

PIDFILE="${PWD}/.speedtest.pids"
CMD="${1:-start}"   # default to start if no argument supplied

# ------------------------------------------------------------
# Helper: export credentials from .env (if present)
# ------------------------------------------------------------
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# ------------------------------------------------------------
# Start services
# ------------------------------------------------------------
start_services() {
  echo "Starting Speedtest services..."

  # Backend (Go binary)
  ./speedtest-backend &
  BACKEND_PID=$!
  echo "Backend PID=$BACKEND_PID"

  # Frontend (static files via serve)
  serve -s frontend/dist -l 8080 &
  FRONTEND_PID=$!
  echo "Frontend PID=$FRONTEND_PID"

  # Optional Node service
  if [ -f node/main.js ]; then
    node node/main.js &
    NODE_PID=$!
    echo "Node PID=$NODE_PID"
  else
    NODE_PID=""
  fi

  # Save PIDs for later stop/restart
  echo "BACKEND_PID=$BACKEND_PID" > "$PIDFILE"
  echo "FRONTEND_PID=$FRONTEND_PID" >> "$PIDFILE"
  echo "NODE_PID=$NODE_PID" >> "$PIDFILE"

  # Graceful shutdown on Ctrl+C or SIGTERM
  trap "stop_services; exit" SIGINT SIGTERM

  # Wait for processes – this keeps the script alive
  wait $BACKEND_PID
  wait $FRONTEND_PID
  if [ -n "$NODE_PID" ]; then
    wait $NODE_PID
  fi
}

# ------------------------------------------------------------
# Stop services
# ------------------------------------------------------------
stop_services() {
  if [ ! -f "$PIDFILE" ]; then
    echo "No PID file found – nothing to stop."
    return
  fi
  echo "Stopping Speedtest services..."
  source "$PIDFILE"
  # Kill processes if they are still running
  [ -n "${BACKEND_PID:-}" ] && kill $BACKEND_PID 2>/dev/null || true
  [ -n "${FRONTEND_PID:-}" ] && kill $FRONTEND_PID 2>/dev/null || true
  [ -n "${NODE_PID:-}" ] && kill $NODE_PID 2>/dev/null || true
  rm -f "$PIDFILE"
  echo "All services stopped."
}

# ------------------------------------------------------------
# Main command dispatch
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
    echo "Invalid command: $CMD"
    echo "Usage: $0 {start|stop|restart}"
    exit 1
    ;;
esac
