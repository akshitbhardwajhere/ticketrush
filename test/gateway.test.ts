import test from "node:test";
import assert from "node:assert/strict";
import { charge, refund } from "../src/gateway.js";

test("local gateway is idempotent and supports local refunds", async () => {
  const previousSecret = process.env.STRIPE_SECRET_KEY;
  const previousMode = process.env.PAYMENT_GATEWAY;
  const previousFailRate = process.env.FAIL_RATE;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.PAYMENT_GATEWAY;
  process.env.FAIL_RATE = "0";
  try {
    const key = `gateway-test-${Date.now()}`;
    const first = await charge(key, 150000);
    const second = await charge(key, 150000);
    assert.deepEqual(second, first);
    assert.equal(first.ok, true);
    assert.equal(await refund(first.chargeId ?? "local-charge"), true);
  } finally {
    if (previousSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousSecret;
    if (previousMode === undefined) delete process.env.PAYMENT_GATEWAY;
    else process.env.PAYMENT_GATEWAY = previousMode;
    if (previousFailRate === undefined) delete process.env.FAIL_RATE;
    else process.env.FAIL_RATE = previousFailRate;
  }
});

test("stripe mode fails explicitly without credentials", async () => {
  const previousSecret = process.env.STRIPE_SECRET_KEY;
  const previousMode = process.env.PAYMENT_GATEWAY;
  delete process.env.STRIPE_SECRET_KEY;
  process.env.PAYMENT_GATEWAY = "stripe";
  try {
    await assert.rejects(() => charge(`stripe-test-${Date.now()}`, 150000));
  } finally {
    if (previousSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousSecret;
    if (previousMode === undefined) delete process.env.PAYMENT_GATEWAY;
    else process.env.PAYMENT_GATEWAY = previousMode;
  }
});
