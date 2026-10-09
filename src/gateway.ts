import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

export type GatewayResult = {
  ok: boolean;
  chargeId?: string;
  status?: string;
  error?: string;
};

const results = new Map<string, GatewayResult>();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let stripeKey: string | undefined;
let stripeClient: Stripe | null = null;

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (key !== stripeKey) {
    stripeKey = key;
    stripeClient = new Stripe(key, {
      apiVersion: "2026-09-30.endive",
      maxNetworkRetries: 2,
      timeout: 10_000,
    });
  }
  return stripeClient;
}

function stripeErrorMessage(error: unknown) {
  if (error instanceof Stripe.errors.StripeError) return error.message;
  return error instanceof Error ? error.message : "Stripe request failed";
}

export async function charge(
  idempotencyKey: string,
  amountPaise: number,
  paymentMethodId?: string,
): Promise<GatewayResult> {
  const stripe = getStripe();
  if (stripe) {
    try {
      const intent = await stripe.paymentIntents.create(
        {
          amount: amountPaise,
          currency: config.paymentCurrency,
          confirm: true,
          ...(paymentMethodId ? { payment_method: paymentMethodId } : {}),
          automatic_payment_methods: {
            enabled: true,
            allow_redirects: "never",
          },
        },
        { idempotencyKey },
      );
      if (intent.status !== "succeeded") {
        return {
          ok: false,
          status: intent.status,
          error: `Payment requires additional action (status: ${intent.status})`,
        };
      }
      return { ok: true, chargeId: intent.id, status: intent.status };
    } catch (error) {
      return { ok: false, error: stripeErrorMessage(error) };
    }
  }

  if ((process.env.PAYMENT_GATEWAY ?? "mock") === "stripe") {
    throw new Error(
      "STRIPE_SECRET_KEY is required when PAYMENT_GATEWAY=stripe",
    );
  }

  const previous = results.get(idempotencyKey);
  if (previous) return previous;
  await sleep(300 + Math.random() * 500);
  const result: GatewayResult =
    Math.random() < Number(process.env.FAIL_RATE ?? 0)
      ? { ok: false }
      : { ok: true, chargeId: randomUUID() };
  results.set(idempotencyKey, result);
  return result;
}

export async function refund(chargeId: string): Promise<boolean> {
  const stripe = getStripe();
  if (!stripe) return true;
  try {
    await stripe.refunds.create(
      { payment_intent: chargeId },
      { idempotencyKey: `refund:${chargeId}` },
    );
    return true;
  } catch (error) {
    console.error("Stripe refund failed", stripeErrorMessage(error));
    return false;
  }
}
