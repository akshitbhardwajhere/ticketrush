const BASE = "http://localhost:3000";
const N = 300;
const SEATS = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(method: string, path: string, body?: unknown) {
  const r = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: r.status, data: await r.json() };
}

async function main() {
  const ev = (
    await api("POST", "/events", {
      name: "Flash Sale",
      startsAt: "2026-12-31T18:00:00Z",
      seats: SEATS,
    })
  ).data;

  const users: number[] = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      api("POST", "/users", { email: `fs${i}@test.com` }).then(
        (r) => r.data.id,
      ),
    ),
  );

  async function person(userId: number): Promise<string> {
    await api("POST", `/events/${ev.id}/queue/join`, { userId });
    while (true) {
      const s = await api(
        "GET",
        `/events/${ev.id}/queue/status?userId=${userId}`,
      );
      if (s.data.status === "ADMITTED") break;
      if (s.data.status === "NOT_IN_QUEUE") return "gaveup";
      await sleep(500);
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      const seats = (await api("GET", `/events/${ev.id}/seats`)).data as {
        id: number;
        status: string;
      }[];
      const free = seats.filter((s) => s.status === "AVAILABLE");
      if (free.length === 0) return "soldout";
      const pick = free[Math.floor(Math.random() * free.length)]!;
      const r = await api("POST", `/events/${ev.id}/seats/${pick.id}/hold`, {
        userId,
      });
      if (r.status === 201) return "won";
      if (r.status === 429) await sleep(1000);
    }
    return "gaveup";
  }

  const t0 = Date.now();
  const results = await Promise.all(users.map(person));
  const tally: Record<string, number> = {};
  results.forEach((r) => (tally[r] = (tally[r] ?? 0) + 1));
  console.log(tally, `in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`event id: ${ev.id}`);
}
main();
