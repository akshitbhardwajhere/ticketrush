#!/usr/bin/env sh
set -eu
BASE_URL=${BASE_URL:-http://localhost:3000}
echo "Running health checks through Nginx at ${BASE_URL}"
curl --fail "${BASE_URL}/health"
echo "Stopping Redis for 10 seconds; rate limiting should fail open and booking state remains in PostgreSQL"
docker compose stop redis
trap 'docker compose start redis db 2>/dev/null || true' EXIT
sleep 10
curl --fail "${BASE_URL}/health"
echo "Stopping PostgreSQL for 10 seconds; requests may fail"
docker compose start redis
docker compose stop db
sleep 10
docker compose start db
until docker compose exec -T db pg_isready -U postgres -d ticketrush >/dev/null 2>&1; do
	sleep 1
done
curl --fail "${BASE_URL}/health"
echo "Chaos run complete. This harness checks health and restart recovery; verify payment and seat invariants separately."