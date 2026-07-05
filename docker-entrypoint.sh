#!/bin/sh
# Start PocketBase (internal only) and the Node API together in one container.
set -e

PB_DIR=/app/pb_data
mkdir -p "$PB_DIR"

# Ensure PocketBase has a superuser matching the app's configured admin creds.
# `upsert` is idempotent, so this is safe on every boot.
if [ -n "$POCKETBASE_ADMIN_EMAIL" ] && [ -n "$POCKETBASE_ADMIN_PASSWORD" ]; then
  /pb/pocketbase superuser upsert "$POCKETBASE_ADMIN_EMAIL" "$POCKETBASE_ADMIN_PASSWORD" --dir "$PB_DIR" \
    || echo "[entrypoint] superuser upsert failed (continuing)"
fi

# PocketBase listens only on localhost; the Node API is the public surface.
/pb/pocketbase serve --http=127.0.0.1:8090 --dir "$PB_DIR" &
PB_PID=$!

# Wait for PocketBase to accept connections before starting the API.
i=0
while [ "$i" -lt 30 ]; do
  if curl -sf http://127.0.0.1:8090/api/health >/dev/null 2>&1; then
    echo "[entrypoint] PocketBase is up"
    break
  fi
  i=$((i + 1))
  sleep 1
done

# Run the Node API in the foreground; if it exits, tear the container down so
# Railway restarts the whole thing.
node src/server.js
STATUS=$?

kill "$PB_PID" 2>/dev/null || true
exit "$STATUS"
