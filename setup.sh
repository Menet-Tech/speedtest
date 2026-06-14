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
# The script now creates systemd services instead of running processes directly.

# ------------------------------------------------------------
# Create systemd service units for Speedtest components
# ------------------------------------------------------------

# Frontend service (serve static files)
cat <<'EOF' | sudo tee /etc/systemd/system/speedtest-fe.service
[Unit]
Description=Speedtest Frontend Service
After=network.target

[Service]
Type=simple
ExecStart=$(which serve) -s $(pwd)/frontend/dist -l 8080
Restart=on-failure
User=$(whoami)
WorkingDirectory=$(pwd)
EnvironmentFile=$(pwd)/.env

[Install]
WantedBy=multi-user.target
EOF

# Backend service (Go binary)
cat <<'EOF' | sudo tee /etc/systemd/system/speedtest-be.service
[Unit]
Description=Speedtest Backend Service
After=network.target

[Service]
Type=simple
ExecStart=$(pwd)/speedtest-backend
Restart=on-failure
User=$(whoami)
WorkingDirectory=$(pwd)
EnvironmentFile=$(pwd)/.env

[Install]
WantedBy=multi-user.target
EOF

# Node service (if applicable)
cat <<'EOF' | sudo tee /etc/systemd/system/speedtest-node.service
[Unit]
Description=Speedtest Node Service
After=network.target

[Service]
Type=simple
ExecStart=$(which node) $(pwd)/node/main.js
Restart=on-failure
User=$(whoami)
WorkingDirectory=$(pwd)
EnvironmentFile=$(pwd)/.env

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd daemon and enable/start services
sudo systemctl daemon-reload
sudo systemctl enable --now speedtest-fe.service
sudo systemctl enable --now speedtest-be.service
sudo systemctl enable --now speedtest-node.service

echo "Systemd services installed and started: speedtest-fe, speedtest-be, speedtest-node"


