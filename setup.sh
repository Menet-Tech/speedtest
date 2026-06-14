#!/usr/bin/env bash

# ------------------------------------------------------------
# Ubuntu setup script for Speedtest project (frontend + backend)
# ------------------------------------------------------------
# This script:
#   1. Prompts the user for the admin password and a 4‑digit PIN.
#   2. Stores them in a .env file (used by both backend and frontend).
#   3. Installs required dependencies (Node, Go, npm packages, serve).
#   4. Builds the frontend (Vite) and backend (Go).
#   5. Starts the backend and serves the built frontend.
# ------------------------------------------------------------

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

# Install exact dependencies (clean install)
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

# Build production bundle
npm run build

# Move back to project root
cd ..

# ----- Backend setup -----------------------------------------------------
cd backend

# Build Go binary (output placed in project root for simplicity)
GOOS=linux GOARCH=amd64 go build -o ../speedtest-backend

cd ..

# ----- Run application ---------------------------------------------------
# Start backend in background, reading credentials from .env
export $(grep -v '^#' .env | xargs)
./speedtest-backend &
BACKEND_PID=$!

echo "Backend started (PID $BACKEND_PID)"

# Serve the frontend static files
serve -s frontend/dist -l 8080 &
FRONTEND_PID=$!

echo "Frontend served at http://localhost:8080 (PID $FRONTEND_PID)"

# Wait for either process to exit (Ctrl+C will terminate both)
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait $BACKEND_PID
wait $FRONTEND_PID

