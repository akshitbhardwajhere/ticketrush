const BASE = "http://localhost:3000";
const eventId = 1;
const seatId = process.argv[2] ?? "2"; // koi AVAILABLE seat

async function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return {
    status: r.status,
    replayed: r.headers.get("idempotent-replayed"),
    body: await r.json(),
  };
}

async function main() {
  const user = (await post("/users", { email: "pay@test.com" })).body;
  const hold = await post(`/events/${eventId}/seats/${seatId}/hold`, {
    userId: user.id,
  });
  console.log("hold:", hold.status);

  const key = crypto.randomUUID();
  const payload = { userId: user.id, amountPaise: 150000 };
  const url = `/events/${eventId}/seats/${seatId}/pay`;

  // Double-click / retry storm: same key, 10 parallel requests
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      post(url, payload, { "Idempotency-Key": key }),
    ),
  );
  const tally: Record<number, number> = {};
  results.forEach((r) => (tally[r.status] = (tally[r.status] ?? 0) + 1));
  console.log("10 parallel, same key:", tally);

  // Baad mein retry: stored result replay hona chahiye
  const replay = await post(url, payload, { "Idempotency-Key": key });
  console.log("later retry:", replay.status, "replayed =", replay.replayed);

  // Same key, alag amount: reject hona chahiye
  const bad = await post(
    url,
    { ...payload, amountPaise: 1 },
    { "Idempotency-Key": key },
  );
  console.log("same key, different body:", bad.status);
}

main();
