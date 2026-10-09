# TicketRush

A concurrency-safe ticket booking backend (think BookMyShow): seats can never be double-booked, payments are idempotent, and flash-sale traffic is absorbed by a rate limiter and a Redis-backed waiting room.

**Stack:** Node.js, TypeScript, Express, PostgreSQL, Redis, Stripe, HAProxy, k6 (load testing)

## Highlights

- Hold a seat for 10 minutes, then pay to book it. Expired holds are reclaimed automatically.
- Safe under concurrency: 50 parallel requests for the same seat produce exactly one winner.
- Idempotent payments: retries and double-clicks never charge twice.
- Redis token-bucket rate limiter (atomic Lua script) against abusive clients.
- Waiting room (FIFO queue plus time-limited admission passes) that protects the database during flash sales.
- Password-backed authentication with expiring database sessions.
- Stripe PaymentIntents with idempotency keys and outbox-backed refunds.
- Three API replicas behind HAProxy with automated tests and a Redis/PostgreSQL chaos harness.

## Key design decisions

| Problem                                 | Solution                                                                                                                                                                                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two users grab the same seat            | The check and the write are one SQL statement (`UPDATE ... WHERE status = 'AVAILABLE' OR hold expired`). Postgres row locks serialise concurrent updates, so exactly one wins. Payment re-checks the hold under `SELECT ... FOR UPDATE` inside the booking transaction. |
| Abandoned holds                         | `hold_expires_at` is checked in the same `WHERE` clause, so expired holds are reclaimed lazily with no cron job.                                                                                                                                                        |
| Double charge on retry or double-click  | The client sends an `Idempotency-Key`. The key is claimed with `INSERT ... ON CONFLICT DO NOTHING` (atomic). Same key and same body replays the stored response, same key with a different body returns 422, and a concurrent duplicate gets 409 "in progress".         |
| Hold expires while payment is in flight | The booking transaction re-validates the hold. If it is gone, the payment is marked `REFUND_REQUIRED` and an outbox event schedules an idempotent refund.                                                                                                           |
| Bots and abusive clients                | Token bucket in Redis, written as a Lua script so read-modify-write is atomic. It uses Redis `TIME` (no clock skew between servers) and fails open if Redis is down.                                                                                                    |
| Traffic spikes                          | Waiting room: a Redis sorted set (FIFO by join time). A background admitter pops N users per second (`ZPOPMIN` is atomic, so it is safe with several server instances) and issues passes with a TTL. Enabled with `QUEUE_GATE=on`.                                      |

## Results

Measured on a single laptop (API, PostgreSQL, Redis and k6 on the same machine) with a **simulated** payment gateway (300-800 ms latency). These are development-machine numbers, not production benchmarks.

**k6 load test, queue gate off:** 100 concurrent users, 70 s, about 100 req/s sustained, 0% server errors.

| Endpoint                | p95 latency                                 |
| ----------------------- | ------------------------------------------- |
| Hold seat               | 3.3 ms                                      |
| Seat list (3,000 seats) | 4.8 ms                                      |
| Pay                     | 774 ms (dominated by the simulated gateway) |

The ~100 req/s figure is the load profile of the test (each virtual user waits 1 s between iterations), not the server's capacity limit.

**Correctness under load**, verified with SQL after the runs: 2,283 bookings in one run and 2,316 in another, with 0 seats holding more than one successful payment and booked seats equal to successful payments.

**Flash-sale simulation** (300 users, 50 seats, queue enabled): exactly 50 winners, no oversold seats, finished in about 7 s.

**Waiting room** (100 users, admission limited to 2 per second): median queue wait about 20 s, p95 about 35 s, while hold p95 stayed around 4 ms and queue-status p95 around 1.5 ms, with 0 errors. This demonstrates throttled, FIFO admission. It is not a claim of lower latency, because the database was not the bottleneck at this load.

## Architecture

TicketRush is an Express API with a thin HTTP layer. Controllers validate requests and format responses, services own business rules and PostgreSQL transactions, Redis handles queue admission and rate limiting, and the payment gateway uses Stripe PaymentIntents in production or an explicit local mock for development and load tests.

```mermaid
flowchart LR
  Client[Bruno, scripts, k6] --> API[Express API]
  API --> Routes[Routes]
  Routes --> Controllers[Controllers]
  Controllers --> Services[Services]
  Services --> Postgres[(PostgreSQL)]
  Services --> Gateway[Stripe or local gateway]
  API --> Queue[Queue router and admitter]
  Queue --> Redis[(Redis)]
  API --> RateLimit[Rate-limit middleware]
  RateLimit --> Redis
```

## Request flow

With `QUEUE_GATE=on`, the paid booking flow is:

```mermaid
sequenceDiagram
  participant C as Client
  participant A as Express API
  participant R as Redis
  participant D as PostgreSQL
  participant G as Payment gateway

  C->>A: POST /users with email and password
  A->>D: Create user
  C->>A: POST /users/login
  A->>D: Create session
  C->>A: POST /events
  A->>D: Create event and seats
  C->>A: POST /events/{eventId}/queue/join
  A->>D: Validate user and event
  A->>R: Add user to sorted queue
  loop Until admitted
    C->>A: GET /events/{eventId}/queue/status
    A->>R: Read queue rank or admission TTL
  end
  C->>A: POST /events/{eventId}/seats/{seatId}/hold
  A->>R: Check admission pass
  A->>D: Atomically hold available seat
  C->>A: POST /events/{eventId}/seats/{seatId}/pay
  A->>D: Claim idempotency key
  A->>G: Charge payment
  A->>D: Lock seat, book it, store result
  A->>D: Commit payment outbox event
  A-->>C: 200 BOOKED
```

With `QUEUE_GATE=off`, queue join and status can be skipped, but the hold, payment, and database transaction flow remains the same.

The booking flow is `Create user`, `Create event`, `List seats`, `Join queue`, `Queue status`, `Hold seat`, and finally `Pay for seat`. Payment is the only booking path; a hold cannot be converted directly into a booking.

## Requirements

- Node.js 20 or newer
- Docker and Docker Compose

## Run locally

```sh
git clone https://github.com/akshitbhardwajhere/ticketrush.git
cd ticketrush
npm install
docker compose up -d
npm run create-tables
npm run dev
```

HAProxy publishes the API on `http://localhost:3000` by default. Redis listens on port `6331` and PostgreSQL on port `5441`.

## Commands

- `npm run dev` starts the TypeScript server in watch mode.
- `npm run typecheck` checks the source without emitting files.
- `npm run build` emits JavaScript and declarations into `dist/`.
- `npm start` runs the compiled server.
- `npm run flash-sale` runs the concurrent seat-hold scenario.
- `npm run rate-limit:test` runs the rate-limit scenario.
- `npm run load:k6` runs the k6 load test without queue admission.
- `npm run load:gated:k6` runs the k6 load test with queue admission.
- `npm run create-tables` creates the base schema and applies all migrations.
- `npm test` runs unit and integration tests.
- `sh scripts/chaos.sh` exercises Redis and PostgreSQL interruption scenarios.

## k6 load tests

Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) separately, then start the API with the mode required by the test. The scripts register and log in unique users during setup, then use bearer tokens for queue, hold, and payment requests.

### Ungated load test

`scripts/load.ts` tests seat listing, concurrent holds, rate limiting, and payments without queue admission. It expects `QUEUE_GATE=off`:

```sh
QUEUE_GATE=off npm run dev
npm run load:k6
```

Set a different API URL with `BASE_URL`:

```sh
BASE_URL=http://localhost:3000 k6 run scripts/load.ts
```

For the Compose stack shown in this repository, use `BASE_URL=http://127.0.0.1:3002`. Keep `PAYMENT_GATEWAY=mock` for load tests unless you intentionally want to create Stripe test PaymentIntents at load volume.

The load test setup creates one event with 3,000 seats and 100 users. It then runs 100 virtual users through a 70-second test:

- 20 seconds ramping up to 100 VUs
- 40 seconds at 100 VUs
- 10 seconds ramping down to zero

Each virtual user periodically lists seats, attempts a random seat hold, and pays for successful holds with a unique idempotency key. `409` seat conflicts and `429` rate-limit responses are expected. The configured thresholds are:

- Less than 1% failed HTTP requests
- Hold latency p95 below 100 ms
- Seat-list latency p95 below 300 ms
- Payment latency p95 below 1 second

### Queue-gated load test

`scripts/load-gated.ts` tests queue joining, admission polling, queue wait time, holds, rate limiting, and payments. It expects `QUEUE_GATE=on`:

```sh
QUEUE_GATE=on npm run dev
npm run load:gated:k6
```

The gated test uses the same 3,000-seat event and 100 users, ramps to 100 VUs over 10 seconds, holds 100 VUs for 50 seconds, and ramps down over 10 seconds. Each VU joins the queue when its admission pass is missing or expired, polls until `ADMITTED` for up to two minutes, then attempts a random seat hold and payment. It records queue wait time as `queue_wait_ms` and accepts `403`, `409`, and `429` as expected hold outcomes.

To see a real queue form, slow the admission rate, for example `QUEUE_GATE=on ADMIT_PER_TICK=2 PASS_TTL_SEC=30 npm run dev`.

Use `BASE_URL` for a non-default API address:

```sh
BASE_URL=http://localhost:3000 npm run load:gated:k6
```

The same `BASE_URL=http://127.0.0.1:3002` and mock-gateway recommendation applies to the gated test.

## Configuration

Copy the local values into `.env` when overriding defaults:

| Variable         | Default                                              | Purpose                                          |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------ |
| `PORT`           | `3000`                                               | HTTP server port                                 |
| `DATABASE_URL`   | `postgres://postgres:pass@localhost:5441/ticketrush` | PostgreSQL connection                            |
| `REDIS_URL`      | `redis://localhost:6331`                             | Redis connection                                 |
| `QUEUE_GATE`     | `off`                                                | Set to `on` to require queue admission for holds |
| `ADMIT_PER_TICK` | `20`                                                 | Queue admissions per second                      |
| `PASS_TTL_SEC`   | `120`                                                | How long an admission pass stays valid           |
| `FAIL_RATE`      | `0`                                                  | Simulated payment gateway failure rate           |
| `PAYMENT_GATEWAY` | `mock`                                               | Set to `stripe` to enable Stripe PaymentIntents  |
| `STRIPE_SECRET_KEY` | unset                                             | Stripe secret key; keep it in `.env` or a secret manager |
| `PAYMENT_CURRENCY` | `inr`                                               | Stripe currency                                  |
| `API_HTTP_PORT`  | `3000`                                               | Host port published by HAProxy                   |

## Database changes

`schema.sql` is the clean local bootstrap schema. Files in `migrations/` are incremental changes intended for an already-created database; apply them in filename order after the bootstrap schema. `npm run create-tables` applies the bootstrap schema and all current migrations.

## Layout

```text
src/
  index.ts              Express app and route registration
  server.ts             Process startup
  config.ts             Environment-backed runtime settings
  controllers/          HTTP input validation and responses
  routes/               Resource route definitions
  middlewares/          Reusable route middleware
  services/             Database transactions and business logic
  db.ts, redis.ts       External service clients
  queue.ts              Queue admission middleware and worker
  ratelimit.ts          Redis token-bucket implementation
  gateway.ts            Stripe/local payment gateway adapter
  http-error-handler.ts Shared HTTP error responses
scripts/                Manual concurrency and rate-limit scenarios
bruno/                  Bruno API collection
migrations/             Incremental SQL changes
schema.sql              Clean local bootstrap schema
docker-compose.yml      PostgreSQL and Redis services
tsconfig.json           TypeScript compiler configuration
```

Additional TypeScript scenarios are available directly with `tsx`:

```sh
npx tsx scripts/race.ts
npx tsx scripts/pay-race.ts [seatId]
```

`race.ts` sends 50 concurrent holds for one seat. `pay-race.ts` verifies same-key payment retries, replay behavior, and rejection when a key is reused with a different request body. These scripts use fixed event IDs and should be run only against matching local test data.

## Known limitations and future work

- If the server crashes after charging but before committing, a payment can stay `PROCESSING`. A sweeper job should retry those with the same idempotency key (safe, because the gateway is idempotent).
- Refunds are processed by the outbox worker; failed refund attempts remain pending for retry.
- Queue status is polled; Server-Sent Events or WebSockets would cut polling traffic.
- Authentication uses password-backed, database sessions. Register with `POST /users` and login with `POST /users/login`; send the returned token as `Authorization: Bearer ...`.
- Payments use Stripe PaymentIntents when `STRIPE_SECRET_KEY` is configured. The local simulator is used only when `PAYMENT_GATEWAY` is not `stripe`.
- Payment completion emits a transactional outbox event, and every API replica runs a `SKIP LOCKED` worker.

## Production-like local stack

The compose stack runs three API replicas behind HAProxy on `http://localhost:3000`. It includes PostgreSQL, Redis, migrations, and the load balancer; Grafana and Prometheus are not part of the stack. Start it with:

```sh
docker compose up -d --build
npm run create-tables
```

If port `3000` is already in use, set `API_HTTP_PORT` to publish HAProxy on another host port, for example `API_HTTP_PORT=3002 docker compose up -d --build`.

Run automated checks with `npm test` and `npm run typecheck`. Run the failure harness with `sh scripts/chaos.sh`; after a chaos run, verify the invariant that every `SUCCEEDED` payment has exactly one `BOOKED` seat.

Set `STRIPE_SECRET_KEY` and `PAYMENT_GATEWAY=stripe` for real payments. Never use the local simulator in production. A public deployment still needs a cloud account, managed PostgreSQL/Redis, Stripe credentials, TLS, and a secret manager; this repository cannot provision an external account without those credentials.
