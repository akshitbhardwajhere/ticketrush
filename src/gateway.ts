import { randomUUID } from "crypto";

type GatewayResult = { ok: boolean; chargeId?: string };

const results = new Map<string, GatewayResult>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function charge(
  idempotencyKey: string,
  _amountPaise: number,
): Promise<GatewayResult> {
  const prev = results.get(idempotencyKey);
  if (prev) return prev; // same key = same result, dobara charge nahi

  await sleep(300 + Math.random() * 500); // network latency
  const failRate = Number(process.env.FAIL_RATE ?? 0);
  const result: GatewayResult =
    Math.random() < failRate
      ? { ok: false }
      : { ok: true, chargeId: randomUUID() };

  results.set(idempotencyKey, result);
  return result;
}
