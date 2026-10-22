# TicketRush

[![CI](https://github.com/akshitbhardwajhere/ticketrush/actions/workflows/ci.yml/badge.svg)](https://github.com/akshitbhardwajhere/ticketrush/actions/workflows/ci.yml)

Concurrency-safe ticket booking backend. Seats are never double-booked, payments are idempotent, and flash-sale traffic is absorbed by a Redis-backed waiting room.

**Stack:** Node.js · TypeScript · Express · PostgreSQL · Redis · Stripe · Nginx · k6

---

## Features

- **Seat hold + pay flow** — hold a seat for 10 minutes, then pay to confirm it; expired holds are reclaimed automatically
- **Concurrency safety** — 50 parallel requests for the same seat produce exactly one winner via atomic SQL
- **Idempotent payments** — retries and double-clicks never charge twice; `Idempotency-Key` is claimed atomically
- **Rate limiting** — Redis token-bucket (atomic Lua script) protects against abusive clients; fails open if Redis is down
- **Waiting room** — FIFO queue with time-limited admission passes absorbs flash-sale traffic spikes (`QUEUE_GATE=on`)
- **Auth** — scrypt password hashing, random bearer tokens stored as SHA-256, sessions expire after 30 days
- **Stripe integration** — PaymentIntents with idempotency keys; failed refunds retried via transactional outbox
- **Production-like stack** — 3 API replicas behind Nginx, Redis, PostgreSQL, CI, and a chaos harness

---

## How it works

| Problem | Solution |
| --- | --- |
| Two users grab the same seat | Single atomic `UPDATE … WHERE status = 'AVAILABLE'`; Postgres row locks pick exactly one winner |
| Abandoned holds | `hold_expires_at` checked in the same `WHERE` clause — no cron job needed |
| Double charge on retry | Client sends `Idempotency-Key`; claimed with `INSERT … ON CONFLICT DO NOTHING` |
| Hold expires mid-payment | Booking transaction re-validates; if gone, payment is marked `REFUND_REQUIRED` |
| Abusive clients | Atomic Lua token-bucket in Redis; fails open if Redis is down |
| Traffic spikes | Waiting room: Redis sorted set + background admitter; enable with `QUEUE_GATE=on` |

---

## Quick start

```sh
git clone https://github.com/akshitbhardwajhere/ticketrush.git
cd ticketrush
npm install
docker compose up -d
npm run create-tables
npm run dev
```

API available at `http://localhost:3000`. Redis on `6331`, PostgreSQL on `5441`.

---

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | TypeScript server in watch mode |
| `npm test` | Unit and integration tests |
| `npm run typecheck` | Type-check without emitting |
| `npm run build` | Compile to `dist/` |
| `npm run load:k6` | k6 load test (ungated) |
| `npm run load:gated:k6` | k6 load test (queue-gated) |
| `npm run flash-sale` | Concurrent seat-hold scenario |
| `npm run create-tables` | Bootstrap schema + all migrations |
| `sh scripts/chaos.sh` | Redis/PostgreSQL interruption harness |

---

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP server port |
| `DATABASE_URL` | `postgres://user:password@localhost:5441/ticketrush` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6331` | Redis connection string |
| `QUEUE_GATE` | `off` | `on` to require queue admission for holds |
| `ADMIT_PER_TICK` | `20` | Queue admissions per second |
| `PASS_TTL_SEC` | `120` | Admission pass lifetime (seconds) |
| `STRIPE_SECRET_KEY` | —  | Stripe secret key; store in `.env` or a secret manager, never commit |
| `PAYMENT_CURRENCY` | `inr` | Stripe currency |
| `API_HTTP_PORT` | `3000` | Host port published by Nginx |

---

## Load test results

Measured on 2026-10-22 with 3 API replicas behind Nginx, 100 VUs, 3 000 seats, live Stripe PaymentIntents (`pm_card_visa`, `AUTH_IP_CAPACITY=200`).

### Ungated (`QUEUE_GATE=off`) — 20 s ramp · 40 s steady · 10 s ramp-down

| Metric | Value |
| --- | --- |
| Total HTTP requests | 6 334 |
| Throughput | 81.7 req/s |
| Iterations completed | 5 465 |
| `http_req_failed` | **0.00%** ✓ |
| Hold p95 | **2.36 ms** ✓ (threshold `<100 ms`) |
| Seat-list p95 | **5.75 ms** ✓ (threshold `<300 ms`) |
| Pay p95 | **1.45 s** ✗ (threshold `<1 000 ms`) |
| Pay avg | 1.08 s · min 873 ms · max 1.53 s |
| Data received | 90 MB (1.2 MB/s) |

> Pay p95 crosses the 1 s threshold because every payment is a real Stripe API round-trip (~1 s avg). All other thresholds pass cleanly.

### Queue-gated (`QUEUE_GATE=on`) — 10 s ramp · 50 s steady · 10 s ramp-down

| Metric | Value |
| --- | --- |
| Total HTTP requests | 17 395 |
| Throughput | 173.4 req/s |
| Iterations completed | 405 (93 interrupted — VUs in queue poll loop at ramp-down) |
| `http_req_failed` | **0.00%** ✓ |
| Hold p95 | **11.97 ms** ✓ (threshold `<100 ms`) |
| Queue-status p95 | **2.07 ms** ✓ (threshold `<100 ms`) |
| Queue wait | avg 581 ms · p95 862 ms |
| Data received | 5.1 MB (51 kB/s) |

> High request count with low iteration count reflects the queue polling pattern — each VU fires repeated `GET /queue/status` calls while waiting for `ADMITTED`. Zero HTTP failures across all 17 395 requests.

---

## Project layout

```
ticketrush/
├── src/
│   ├── index.ts                  Express app setup and route registration
│   ├── server.ts                 Process entry point
│   ├── config.ts                 Environment-backed runtime settings
│   ├── db.ts                     PostgreSQL client
│   ├── redis.ts                  Redis client
│   ├── queue.ts                  Waiting-room admission middleware + background worker
│   ├── ratelimit.ts              Redis token-bucket rate limiter (Lua script)
│   ├── gateway.ts                Stripe / local payment gateway adapter
│   ├── outbox.ts                 Transactional outbox worker (SKIP LOCKED)
│   ├── metrics.ts                Custom k6-compatible metrics helpers
│   ├── http-error-handler.ts     Shared HTTP error response formatter
│   ├── controllers/
│   │   ├── event-controller.ts   Create event, list seats
│   │   ├── seat-controller.ts    Hold seat
│   │   ├── payment-controller.ts Pay for held seat, idempotency key handling
│   │   └── user-controller.ts    Register, login, logout, session management
│   ├── routes/
│   │   ├── event-routes.ts       /events and /events/:id/seats/:id/* routes
│   │   └── user-routes.ts        /users and /users/login routes
│   ├── middlewares/
│   │   ├── auth.ts               Bearer token verification
│   │   ├── auth-rate-limit.ts    Per-IP rate limit on auth endpoints
│   │   └── hold-rate-limit.ts    Per-user rate limit on hold endpoint
│   └── services/
│       ├── auth-service.ts       scrypt hashing, session create/revoke
│       ├── user-service.ts       User lookup helpers
│       ├── event-service.ts      Event + seat creation
│       ├── seat-service.ts       Atomic seat hold and expiry logic
│       └── payment-service.ts    Payment charge, idempotency, refund outbox
├── test/
│   ├── auth.test.ts              Auth unit tests
│   ├── gateway.test.ts           Payment gateway unit tests
│   └── integration.test.ts       End-to-end booking flow tests
├── scripts/
│   ├── load.ts                   k6 ungated load test
│   ├── load-gated.ts             k6 queue-gated load test
│   ├── flash-sale.ts             Concurrent seat-hold scenario
│   ├── race.ts                   50 parallel holds for one seat
│   ├── pay-race.ts               Idempotency-key retry and replay tests
│   ├── rl-test.ts                Rate-limit smoke test
│   └── chaos.sh                  Redis/PostgreSQL interruption harness
├── migrations/
│   ├── 002_payments.sql          Payments table
│   ├── 003_integrity_constraints.sql  DB-level booking invariants
│   ├── 004_auth_outbox.sql       Sessions + outbox tables
│   ├── 005_payment_reconciliation.sql Reconciliation worker columns
│   └── 006_session_revocation.sql     Session revocation support
├── bruno/                        Bruno API collection (manual testing)
├── schema.sql                    Clean bootstrap schema (run before migrations)
├── docker-compose.yml            3 API replicas + Nginx + Redis + PostgreSQL
├── nginx.conf                    Reverse proxy and load balancer config
├── Dockerfile                    API image definition
├── tsconfig.json                 TypeScript compiler config
└── .github/workflows/            CI: typecheck and test on every push
```

---

Licensed under the [ISC License](LICENSE).
