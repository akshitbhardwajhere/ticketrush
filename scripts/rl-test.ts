const BASE = "http://localhost:3000";
const post = (path: string, body: unknown) =>
  fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

async function main() {
  const user = await (await post("/users", { email: "rl@test.com" })).json();
  const statuses = await Promise.all(
    Array.from({ length: 20 }, () =>
      post("/events/1/seats/10/hold", { userId: user.id }).then(
        (r) => r.status,
      ),
    ),
  );
  const tally: Record<number, number> = {};
  statuses.forEach((s) => (tally[s] = (tally[s] ?? 0) + 1));
  console.log(tally);
}
main();
