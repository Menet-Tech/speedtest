#!/usr/bin/env bash

BACKEND_DIR="$(cd "$(dirname "$0")/backend" && pwd)"
NODE_DIR="$(cd "$(dirname "$0")/node" && pwd)"
FRONTEND_DIR="$(cd "$(dirname "$0")/frontend" && pwd)"

BACKEND_BIN="$BACKEND_DIR/speedtest-backend"
NODE_BIN="$NODE_DIR/speedtest-node"

BACKEND_PORT=8080
FRONTEND_PORT=3000

start_services() {
    echo "[STOP] Killing old services..."
    pkill -f speedtest-backend 2>/dev/null || true
    pkill -f speedtest-node 2>/dev/null || true
    pkill -f "npm run dev" 2>/dev/null || true

    echo "[BUILD] Backend..."
    cd "$BACKEND_DIR" || exit 1
    go build -o speedtest-backend .
    if [ $? -ne 0 ]; then
        echo "❌ Backend build FAILED"
        exit 1
    fi

    echo "[BUILD] Node..."
    cd "$NODE_DIR" || exit 1
    go build -o speedtest-node .
    if [ $? -ne 0 ]; then
        echo "⚠️ Node build FAILED → fallback go run"
        nohup go run main.go > node.log 2>&1 &
    else
        nohup ./speedtest-node > node.log 2>&1 &
    fi

    echo "[START] Frontend..."
    cd "$FRONTEND_DIR" || exit 1

    if [ -f package.json ]; then
        nohup npm install > frontend_install.log 2>&1 &
        nohup npm run dev > frontend.log 2>&1 &
        echo "Frontend running on http://localhost:$FRONTEND_PORT"
    else
        echo "⚠️ Frontend not found (no package.json)"
    fi

    echo "[START] Backend..."
    nohup "$BACKEND_BIN" > backend.log 2>&1 &

    echo "Waiting..."
    sleep 3

    echo "Open browser..."
    xdg-open "http://localhost:$FRONTEND_PORT" 2>/dev/null || true

    echo "✅ DONE"
}

stop_services() {
    echo "[STOP] services..."
    pkill -f speedtest-backend 2>/dev/null || true
    pkill -f speedtest-node 2>/dev/null || true
    pkill -f "npm run dev" 2>/dev/null || true
    echo "Stopped"
}

restart_services() {
    stop_services
    sleep 2
    start_services
}

case "$1" in
    start) start_services ;;
    stop) stop_services ;;
    restart) restart_services ;;
    *)
        echo "Usage: $0 {start|stop|restart}"
        ;;
esac