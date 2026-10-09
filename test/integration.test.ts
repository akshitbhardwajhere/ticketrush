import test from "node:test";
import assert from "node:assert/strict";

test("API health endpoint is reachable when integration environment is enabled", async (context) => {
  if (process.env.RUN_INTEGRATION !== "1") {
    context.skip("Set RUN_INTEGRATION=1 with the compose stack running");
    return;
  }
  const response = await fetch(
    `${process.env.BASE_URL ?? "http://127.0.0.1:3000"}/health`,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "ok");
});

test("registration and login enforce the authenticated user contract", async (context) => {
  if (process.env.RUN_INTEGRATION !== "1") {
    context.skip("Set RUN_INTEGRATION=1 with the compose stack running");
    return;
  }
  const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
  const email = `integration-${Date.now()}@test.local`;
  const password = "correct-horse-battery-staple";
  const create = await fetch(`${baseUrl}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(create.status, 201);

  const duplicate = await fetch(`${baseUrl}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(duplicate.status, 409);

  const login = await fetch(`${baseUrl}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200);
  const payload = (await login.json()) as { token?: string };
  assert.equal(typeof payload.token, "string");

  const invalidSeatPayment = await fetch(
    `${baseUrl}/events/1/seats/999999/pay`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${payload.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `invalid-seat-${Date.now()}`,
      },
      body: JSON.stringify({
        amountPaise: 150000,
        paymentMethodId: "pm_card_visa",
      }),
    },
  );
  assert.equal(invalidSeatPayment.status, 404);
});
