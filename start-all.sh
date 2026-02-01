#!/usr/bin/env bash
# Start backend (port 8000) and frontend (port 5173) from project root.
# Usage: ./start-all.sh   (or: bash start-all.sh)
# Ctrl+C stops the frontend; the backend keeps running until you kill it or close the terminal.

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Start backend in background
echo "Starting backend on http://localhost:8000 ..."
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
UVICORN_PID=$!

# Give backend a moment to bind
sleep 2

# Start frontend in foreground (you see logs here)
echo "Starting frontend on http://localhost:5173 ..."
cd "$ROOT/frontend"
exec npm run dev
