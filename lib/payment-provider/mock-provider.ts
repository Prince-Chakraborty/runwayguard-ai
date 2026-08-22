import { PaymentProvider, HoldRequestResult } from "./types";
import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";

// Deterministic, clearly-labeled mock. References follow the SHAPE of real
// Razorpay identifiers (e.g. "pout_" prefix used by actual Payout objects)
// so the integration boundary is realistic to review — but every object
// created here is tagged `simulated: true` and never claims to be a live
// Razorpay transaction. Swapping this for lib/payment-provider/razorpay-provider.ts
// requires no changes anywhere else in the codebase (see types.ts).
export class MockPaymentProvider implements PaymentProvider {
  async getAccountBalance(merchantId: string): Promise<number> {
    const settlements = await prisma.settlement.findMany({ where: { merchantId, status: "settled" } });
    const paidOut = await prisma.payable.findMany({ where: { merchantId, status: "paid" } });
    const base = 180000;
    const inflow = settlements.reduce((s, x) => s + x.amount, 0);
    const outflow = paidOut.reduce((s, x) => s + x.amount, 0);
    return base + inflow - outflow;
  }

  async createPaymentHoldRequest(payableId: string, delayDays: number): Promise<HoldRequestResult> {
    const ref = `mock_pout_${randomId()}`;

    await emitWebhookEvent(ref, "payout.hold.simulated", {
      payableId,
      delayDays,
      simulated: true,
      note: "Razorpay does not currently expose a documented 'hold payout' endpoint. This event simulates the intended effect for demo purposes only.",
    });

    return {
      supported: true,
      simulated: true,
      providerRef: ref,
      message: `Simulated: payable held for ${delayDays} day(s), no real fund movement occurred.`,
    };
  }

  async createReleaseRequest(payableId: string): Promise<HoldRequestResult> {
    const ref = `mock_pout_${randomId()}`;

    await emitWebhookEvent(ref, "payout.release.simulated", { payableId, simulated: true });

    return {
      supported: true,
      simulated: true,
      providerRef: ref,
      message: `Simulated: hold released on payable ${payableId}.`,
    };
  }

  async createEarlySettlementRequest(merchantId: string, amount: number): Promise<HoldRequestResult> {
    const ref = `mock_setl_${randomId()}`;

    await emitWebhookEvent(ref, "settlement.early_request.simulated", {
      merchantId,
      amount,
      simulated: true,
      note: "Real Razorpay early-settlement support not verified against current documentation — simulation only.",
    });

    return {
      supported: true,
      simulated: true,
      providerRef: ref,
      message: `Simulated: early settlement of ₹${amount} requested. This is a simulation only.`,
    };
  }
}

function randomId(): string {
  return randomBytes(7).toString("hex");
}

async function emitWebhookEvent(providerEventId: string, type: string, payload: object) {
  // Models the real flow: an action triggers a provider-side event, which
  // arrives asynchronously via webhook and is processed idempotently by
  // providerEventId. In mock mode we emit it synchronously and immediately
  // "process" it — but through the exact same table/shape the real
  // webhook processor (Phase 4) will use.
  await prisma.webhookEvent.create({
    data: {
      providerEventId,
      type,
      payload: payload as any,
      processedAt: new Date(),
    },
  });
}
