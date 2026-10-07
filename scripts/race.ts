const BASE = "http://localhost:3000";
const N = 50;

async function main() {
  const userIds: number[] = [];
  for (let i = 0; i < N; i++) {
    const r = await fetch(`${BASE}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `race${i}@test.com` }),
    });
    userIds.push((await r.json()).id);
  }

  // Sab 50 log ek hi seat (event 1, seat 1) ek saath maangte hain
  const results = await Promise.all(
    userIds.map((userId) =>
      fetch(`${BASE}/events/1/seats/1/hold`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      }).then((r) => r.status),
    ),
  );

  const ok = results.filter((s) => s === 201).length;
  const conflict = results.filter((s) => s === 409).length;
  console.log({ success: ok, conflict });
}

main();
