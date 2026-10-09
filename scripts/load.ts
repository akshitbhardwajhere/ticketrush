import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const JSON_HEADERS = { "Content-Type": "application/json" };
const PASSWORD = "load-test-password-2026";

// 409 (seat le li) aur 429 (rate limit) expected hain, sirf 5xx "failure" gina jaaye
http.setResponseCallback(
  http.expectedStatuses(200, 201, 400, 401, 402, 404, 409, 429),
);

export const options = {
  stages: [
    { duration: "20s", target: 100 }, // ramp up
    { duration: "40s", target: 100 }, // steady load
    { duration: "10s", target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{name:hold}": ["p(95)<100"],
    "http_req_duration{name:list_seats}": ["p(95)<300"],
    "http_req_duration{name:pay}": ["p(95)<1000"], // isme mock gateway ke 300-800ms shaamil hain
  },
};

export function setup() {
  const ev = http
    .post(
      `${BASE}/events`,
      JSON.stringify({
        name: "Load Test",
        startsAt: "2026-12-31T18:00:00Z",
        seats: 3000,
      }),
      { headers: JSON_HEADERS },
    )
    .json();

  const seats = http
    .get(`${BASE}/events/${ev.id}/seats`)
    .json()
    .map((s) => s.id);

  const runId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const users = [];
  for (let i = 0; i < 100; i++) {
    const email = `k6-${runId}-${i}@test.com`;
    const create = http.post(
      `${BASE}/users`,
      JSON.stringify({ email, password: PASSWORD }),
      { headers: JSON_HEADERS },
    );
    check(create, { "user: created": (r) => r.status === 201 });
    const login = http.post(
      `${BASE}/users/login`,
      JSON.stringify({ email, password: PASSWORD }),
      { headers: JSON_HEADERS },
    );
    const token = login.json("token");
    check(login, {
      "user: logged in": (r) => r.status === 200 && typeof token === "string",
    });
    users.push({ token });
  }
  console.log(`EVENT_ID=${ev.id}`);
  return { eventId: ev.id, seats, users };
}

export default function (data) {
  const user = data.users[(__VU - 1) % data.users.length];
  const authHeaders = {
    ...JSON_HEADERS,
    Authorization: `Bearer ${user.token}`,
  };

  // Har 10 iteration mein ek baar seat map dekho
  if (__ITER % 10 === 0) {
    http.get(`${BASE}/events/${data.eventId}/seats`, {
      tags: { name: "list_seats" },
    });
  }

  const seatId = data.seats[Math.floor(Math.random() * data.seats.length)];
  const hold = http.post(
    `${BASE}/events/${data.eventId}/seats/${seatId}/hold`,
    JSON.stringify({}),
    { headers: authHeaders, tags: { name: "hold" } },
  );
  check(hold, {
    "hold: 201/409/429": (r) => [201, 409, 429].includes(r.status),
  });

  if (hold.status === 201) {
    const pay = http.post(
      `${BASE}/events/${data.eventId}/seats/${seatId}/pay`,
      JSON.stringify({ amountPaise: 150000, paymentMethodId: "pm_card_visa" }),
      {
        headers: {
          ...authHeaders,
          "Idempotency-Key": `${__VU}-${__ITER}-${Date.now()}`,
        },
        tags: { name: "pay" },
      },
    );
    check(pay, { "pay: 200": (r) => r.status === 200 });
  }
  sleep(1);
}
