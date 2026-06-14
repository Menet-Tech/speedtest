#!/usr/bin/env bash
# Speedtest App Service Orchestrator (Ubuntu 24.04)
# Handles starting, stopping, and restarting backend and node daemon services.

set -euo pipefail

# Directories
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$BASE_DIR/backend"
NODE_DIR="$BASE_DIR/node"
LOGS_DIR="$BASE_DIR/logs"

# Binaries
BACKEND_BIN="$BACKEND_DIR/speedtest-backend"
NODE_BIN="$NODE_DIR/speedtest-node"

# PID files
BACKEND_PID_FILE="$BASE_DIR/backend.pid"
NODE_PID_FILE="$BASE_DIR/node.pid"

# Load environment configuration
if [ -f "$BASE_DIR/.env" ]; then
    # Export all variables from .env, ignoring commented lines
    export $(grep -v '^#' "$BASE_DIR/.env" | xargs)
else
    echo "❌ Error: .env file not found! Please run setup.sh first."
    exit 1
fi

# Apply defaults if port variables are empty
BACKEND_PORT=${BACKEND_PORT:-8080}
NODE_PORT=${NODE_PORT:-8081}
NODE_SECRET=${NODE_SECRET:-"speedtest-nodes-auth-secure-key-9988"}

echo "==================================================="
echo "   Speedtest Service Manager (Ubuntu 24.04)"
echo "==================================================="

ensure_logs_dir() {
    mkdir -p "$LOGS_DIR"
}

start_services() {
    ensure_logs_dir
    echo "Starting services..."

    # 1. Start Main Backend
    if [ -f "$BACKEND_PID_FILE" ]; then
        local pid=$(cat "$BACKEND_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo "⚠️ Main Backend is already running (PID $pid)."
        else
            rm -f "$BACKEND_PID_FILE"
        fi
    fi

    if [ ! -f "$BACKEND_PID_FILE" ]; then
        if [ ! -f "$BACKEND_BIN" ]; then
            echo "❌ Error: Backend binary not found at $BACKEND_BIN! Please build it first."
            exit 1
        fi
        echo "Starting Main Backend on port $BACKEND_PORT..."
        cd "$BACKEND_DIR"
        export BACKEND_PORT="$BACKEND_PORT"
        export ADMIN_PASSWORD="$ADMIN_PASSWORD"
        export ADMIN_PIN="$ADMIN_PIN"
        nohup ./speedtest-backend > "$LOGS_DIR/backend.log" 2>&1 &
        echo $! > "$BACKEND_PID_FILE"
        cd "$BASE_DIR"
        echo "✓ Main Backend started (PID $(cat "$BACKEND_PID_FILE"))."
    fi

    # 2. Start Node Server Daemon
    if [ -f "$NODE_PID_FILE" ]; then
        local pid=$(cat "$NODE_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo "⚠️ Node Server Daemon is already running (PID $pid)."
        else
            rm -f "$NODE_PID_FILE"
        fi
    fi

    if [ ! -f "$NODE_PID_FILE" ]; then
        if [ ! -f "$NODE_BIN" ]; then
            echo "❌ Error: Node Daemon binary not found at $NODE_BIN! Please build it first."
            exit 1
        fi
        echo "Starting Node Server Daemon on port $NODE_PORT..."
        cd "$NODE_DIR"
        export PORT="$NODE_PORT"
        export NODE_SECRET="$NODE_SECRET"
        nohup ./speedtest-node > "$LOGS_DIR/node.log" 2>&1 &
        echo $! > "$NODE_PID_FILE"
        cd "$BASE_DIR"
        echo "✓ Node Server Daemon started (PID $(cat "$NODE_PID_FILE"))."
    fi

    sleep 1.5

    # Determine Host IP address
    local host_ip=$(hostname -I | awk '{print $1}' || echo "127.0.0.1")
    if [ -z "$host_ip" ]; then
        host_ip="localhost"
    fi

    echo "==================================================="
    echo "🚀 Services started successfully!"
    echo "👉 Speedtest UI & API: http://$host_ip:$BACKEND_PORT"
    echo "👉 Node Daemon:        http://$host_ip:$NODE_PORT"
    echo "==================================================="
}

stop_services() {
    echo "Stopping services..."

    # 1. Stop Backend
    if [ -f "$BACKEND_PID_FILE" ]; then
        local pid=$(cat "$BACKEND_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            echo "✓ Stopped Main Backend (PID $pid)."
        else
            echo "Backend (PID $pid) was not running."
        fi
        rm -f "$BACKEND_PID_FILE"
    else
        echo "Stopping any lingering speedtest-backend processes..."
        pkill -f "speedtest-backend" 2>/dev/null || true
    fi

    # 2. Stop Node Daemon
    if [ -f "$NODE_PID_FILE" ]; then
        local pid=$(cat "$NODE_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            echo "✓ Stopped Node Server Daemon (PID $pid)."
        else
            echo "Node Daemon (PID $pid) was not running."
        fi
        rm -f "$NODE_PID_FILE"
    else
        echo "Stopping any lingering speedtest-node processes..."
        pkill -f "speedtest-node" 2>/dev/null || true
    fi

    echo "Stopped."
}

status_services() {
    local backend_status="Stopped"
    local node_status="Stopped"

    if [ -f "$BACKEND_PID_FILE" ]; then
        local pid=$(cat "$BACKEND_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            backend_status="Running (PID $pid)"
        fi
    fi

    if [ -f "$NODE_PID_FILE" ]; then
        local pid=$(cat "$NODE_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            node_status="Running (PID $pid)"
        fi
    fi

    echo "==================================================="
    echo "Service Status Summary"
    echo "==================================================="
    echo "Main Backend & UI:  $backend_status"
    echo "Node Server Daemon: $node_status"
    echo "==================================================="
}

restart_services() {
    stop_services
    sleep 2
    start_services
}

case "$1" in
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    status)
        status_services
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac