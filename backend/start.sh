#!/bin/bash
set -e

# Start the LiveKit agent worker in the background
echo "[start.sh] Starting agent worker..."
python services/livekit/agent.py start &
AGENT_PID=$!
echo "[start.sh] Agent worker PID: $AGENT_PID"

# Start the FastAPI server (foreground — keeps container alive)
echo "[start.sh] Starting FastAPI server..."
exec uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1
