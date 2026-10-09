#!/usr/bin/env sh
set -eu
BASE_URL=${BASE_URL:-http://localhost:3000}
echo "Running health checks through HAProxy at ${BASE_URL}"
curl --fail "${BASE_URL}/health"
echo "Stopping Redis for 10 seconds; rate limiting should fail open and booking state remains in PostgreSQL"
docker compose stop redis
trap 'docker compose start redis db 2>/dev/null || true' EXIT
sleep 10
curl --fail "${BASE_URL}/health"
echo "Stopping PostgreSQL for 10 seconds; requests may fail, but no partial booking is accepted"
docker compose start redis
docker compose stop db
sleep 10
docker compose start db
curl --fail "${BASE_URL}/health"
echo "Chaos run complete. Verify payments and seats with the SQL invariants in README."