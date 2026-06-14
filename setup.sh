#!/usr/bin/env bash
# Ubuntu 24.04 setup script for Speedtest (frontend + backend + node)

set -euo pipefail

echo "==================================================="
echo "   Speedtest App Setup (Ubuntu 24.04)"
echo "==================================================="

# Check OS compatibility
if [ -f /etc/os-release ]; then
    . /etc/os-release
    if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
        echo "⚠️ Warning: This script is optimized for Ubuntu/Debian."
        read -p "Do you want to continue anyway? [y/N]: " choice
        if [[ ! "$choice" =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
else
    echo "⚠️ Warning: Unable to detect OS type. Proceeding..."
fi

# Detect if sudo is needed
SUDO=""
if [ "$EUID" -ne 0 ]; then
    if command -v sudo &> /dev/null; then
        SUDO="sudo"
    else
        echo "❌ Error: sudo is not installed and you are not running as root."
        echo "Please run this script as root or install sudo."
        exit 1
    fi
fi

# Helper to check and install a package
ensure_installed() {
    local cmd="$1"
    local pkg="$2"
    if ! command -v "$cmd" &> /dev/null; then
        echo "Installing $pkg..."
        $SUDO apt-get update -qq
        $SUDO apt-get install -y "$pkg"
    else
        echo "✓ $pkg is already installed."
    fi
}

echo "Checking required system dependencies..."
ensure_installed "go" "golang-go"
ensure_installed "node" "nodejs"
ensure_installed "npm" "npm"
#ensure_installed "traceroute" "traceroute"
ensure_installed "git" "git"

# ----- Collect admin credentials & configuration -----------------------
echo ""
echo "---------------------------------------------------"
echo "   Configuration Setup"
echo "---------------------------------------------------"

# Helper to read input with a default value
read_default() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    local val=""
    read -p "$prompt [$default]: " val
    if [ -z "$val" ]; then
        eval "$var_name=\"$default\""
    else
        eval "$var_name=\"$val\""
    fi
}

# Helper to read secret input with a default value
read_secret_default() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    local val=""
    read -rsp "$prompt [$default]: " val
    echo "" # newline
    if [ -z "$val" ]; then
        eval "$var_name=\"$default\""
    else
        eval "$var_name=\"$val\""
    fi
}

read_secret_default "Enter Admin Password" "admin" ADMIN_PASSWORD
read_default "Enter 4-digit site access PIN" "1234" ADMIN_PIN
read_default "Enter Backend Port" "8080" BACKEND_PORT
read_default "Enter Node Daemon Port" "8081" NODE_PORT

# Generate random NODE_SECRET
NODE_SECRET=$(openssl rand -hex 16 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1 || echo "speedtest-nodes-auth-secure-key-9988")

# Create .env file
cat > .env <<EOF
# Admin Credentials
ADMIN_PASSWORD=$ADMIN_PASSWORD
ADMIN_PIN=$ADMIN_PIN

# Service Ports
BACKEND_PORT=$BACKEND_PORT
NODE_PORT=$NODE_PORT

# Auth secret between main backend & node daemon
NODE_SECRET=$NODE_SECRET
EOF

echo "✓ Configuration saved to .env file."

# ----- Build application parts ------------------------------------------
echo ""
echo "---------------------------------------------------"
echo "   Building Frontend (Vite + React)"
echo "---------------------------------------------------"

if [ -d "frontend" ]; then
    cd frontend
    echo "Installing frontend npm dependencies..."
    npm install
    echo "Compiling frontend assets..."
    npm run build
    cd ..
    echo "✓ Frontend built successfully (assets copied to backend/dist)."
else
    echo "❌ Error: 'frontend' directory not found!"
    exit 1
fi

echo ""
echo "---------------------------------------------------"
echo "   Building Go Binaries (Backend + Node)"
echo "---------------------------------------------------"

# Build main backend
if [ -d "backend" ]; then
    cd backend
    echo "Building speedtest-backend..."
    go build -o speedtest-backend .
    cd ..
    echo "✓ Main Backend compiled."
else
    echo "❌ Error: 'backend' directory not found!"
    exit 1
fi

# Build node daemon
if [ -d "node" ]; then
    cd node
    echo "Building speedtest-node daemon..."
    go build -o speedtest-node .
    cd ..
    echo "✓ Node Daemon compiled."
else
    echo "❌ Error: 'node' directory not found!"
    exit 1
fi

echo ""
echo "==================================================="
echo "   Setup Completed Successfully!"
echo "==================================================="
echo "To manage services, use the following commands:"
echo "  Start:   ./speedtest.sh start"
echo "  Stop:    ./speedtest.sh stop"
echo "  Restart: ./speedtest.sh restart"
echo "==================================================="
