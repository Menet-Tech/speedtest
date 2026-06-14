#!/usr/bin/env bash
# Ubuntu setup script for Speedtest (frontend + backend)

set -euo pipefail

# ----- Helper functions -------------------------------------------------
function ask_secret() {
  local prompt="$1"
  read -rsp "$prompt: " value
  echo "$value"
  echo    # newline after hidden input
}

function ask_input() {
  local prompt="$1"
  read -p "$prompt: " value
  echo "$value"
}

# ----- Collect admin credentials ----------------------------------------
ADMIN_PASSWORD=$(ask_secret "Enter admin password")
ADMIN_PIN=$(ask_input "Enter 4‑digit admin PIN")

# ----- Create .env file -------------------------------------------------
cat > .env <<EOF
ADMIN_PASSWORD=$ADMIN_PASSWORD
ADMIN_PIN=$ADMIN_PIN
EOF

echo ".env file created with provided credentials."

# ----- Ensure required tools are installed --------------------------------
# Node.js & npm (assume already installed on Ubuntu, otherwise instruct user)
# Go (assume already installed)
# serve (static file server for the built frontend)
if ! command -v serve >/dev/null 2>&1; then
  echo "Installing 'serve' globally via npm..."
  npm install -g serve
fi

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
