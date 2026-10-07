import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const H = { "Content-Type": "application/json" };
const queueWait = new Trend("queue_wait_ms", true);

http.setResponseCallback(http.expectedStatuses(200, 201, 409, 429));

export const options = {
  stages: [
    { duration: "10s", target: 100 },
    { duration: "50s", target: 100 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:hold}": ["p(95)<100"],
    "http_req_duration{name:queue_status}": ["p(95)<100"],
  },
};

export function setup() {
  const ev = http
    .post(
      `${BASE}/events`,
      JSON.stringify({
        name: "Gated Load Test",
        startsAt: "2026-12-31T18:00:00Z",
        seats: 3000,
      }),
      { headers: H },
    )
    .json();
  const seats = http
    .get(`${BASE}/events/${ev.id}/seats`)
    .json()
    .map((s) => s.id);
  const users = [];
  for (let i = 0; i < 100; i++) {
    users.push(
      http
        .post(`${BASE}/users`, JSON.stringify({ email: `k6-${i}@test.com` }), {
          headers: H,
        })
        .json().id,
    );
  }
  console.log(`EVENT_ID=${ev.id}`);
  return { eventId: ev.id, seats, users };
}

let admittedUntil = 0; // har VU ka apna state

export default function (data) {
  const userId = data.users[(__VU - 1) % data.users.length];

  // Pass nahi hai ya expire ho gaya: queue join karo aur admit hone tak ruko
  if (Date.now() >= admittedUntil) {
    const t0 = Date.now();
    http.post(
      `${BASE}/events/${data.eventId}/queue/join`,
      JSON.stringify({ userId }),
      { headers: H, tags: { name: "queue_join" } },
    );

    for (let i = 0; i < 240; i++) {
      // max ~2 min wait
      const s = http
        .get(`${BASE}/events/${data.eventId}/queue/status?userId=${userId}`, {
          tags: { name: "queue_status" },
        })
        .json();
      if (s.status === "ADMITTED") {
        admittedUntil = Date.now() + Math.max(0, s.expiresInSec - 2) * 1000;
        break;
      }
      if (s.status === "NOT_IN_QUEUE") break;
      sleep(0.5);
    }
    queueWait.add(Date.now() - t0);
  }

  const seatId = data.seats[Math.floor(Math.random() * data.seats.length)];
  const hold = http.post(
    `${BASE}/events/${data.eventId}/seats/${seatId}/hold`,
    JSON.stringify({ userId }),
    { headers: H, tags: { name: "hold" } },
  );
  check(hold, {
    "hold: 201/403/409/429": (r) => [201, 403, 409, 429].includes(r.status),
  });

  if (hold.status === 201) {
    const pay = http.post(
      `${BASE}/events/${data.eventId}/seats/${seatId}/pay`,
      JSON.stringify({ userId, amountPaise: 150000 }),
      {
        headers: { ...H, "Idempotency-Key": `${__VU}-${__ITER}-${Date.now()}` },
        tags: { name: "pay" },
      },
    );
    check(pay, { "pay: 200": (r) => r.status === 200 });
  }
  sleep(1);
}
