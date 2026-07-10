#!/bin/bash
set -e

# Start the LiveKit agent worker in the background
echo "[start.sh] Starting agent worker..."
python services/livekit/agent.py start &
AGENT_PID=$!
echo "[start.sh] Agent worker PID: $AGENT_PID"

# Start the FastAPI server in the background too (not exec'd) so we can
# detect either process dying.
echo "[start.sh] Starting FastAPI server..."
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1 &
API_PID=$!
echo "[start.sh] FastAPI server PID: $API_PID"

# If either process exits, exit the container. The API's /health check has
# no visibility into the backgrounded agent worker — if it crashes, the
# container previously stayed "healthy" forever with no agent ever joining
# calls again. Exiting here lets Docker's `restart: unless-stopped` policy
# actually recover both processes together.
wait -n "$AGENT_PID" "$API_PID"
EXIT_CODE=$?
echo "[start.sh] A process exited (code $EXIT_CODE) — shutting down container so it restarts."
exit "$EXIT_CODE"
