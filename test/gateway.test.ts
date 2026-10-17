import test from "node:test";
import assert from "node:assert/strict";
import { charge } from "../src/gateway.js";

test("gateway requires Stripe credentials", async () => {
  const previousSecret = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  try {
    await assert.rejects(
      () => charge(`stripe-test-${Date.now()}`, 150000),
      /STRIPE_SECRET_KEY is required/,
    );
  } finally {
    if (previousSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousSecret;
  }
});
