#!/usr/bin/env bash
# Ubuntu setup script for Speedtest (frontend + backend)

set -euo pipefail

# … (helper functions, credential collection, .env creation, deps install) …

# ----- Frontend setup ----------------------------------------------------
cd frontend
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
npm run build
cd ..

# ----- Backend setup -----------------------------------------------------
cd backend
GOOS=linux GOARCH=amd64 go build -o ../speedtest-backend
cd ..

# ----- Run application ---------------------------------------------------
export $(grep -v '^#' .env | xargs)

# Start backend
./speedtest-backend &
BACKEND_PID=$!
echo "Backend started (PID $BACKEND_PID)"

# Serve frontend static files
serve -s frontend/dist -l 8080 &
FRONTEND_PID=$!
echo "Frontend served at http://localhost:8080 (PID $FRONTEND_PID)"

# Start node service if present
if [ -f node/main.js ]; then
  node node/main.js &
  NODE_PID=$!
  echo "Node service started (PID $NODE_PID)"
fi

# Wait for processes; handle Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID ${NODE_PID:-} 2>/dev/null; exit" SIGINT SIGTERM
wait $BACKEND_PID
wait $FRONTEND_PID
if [ -n "${NODE_PID:-}" ]; then
  wait $NODE_PID
fi
