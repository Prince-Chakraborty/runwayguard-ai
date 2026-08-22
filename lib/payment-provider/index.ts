import { PaymentProvider } from "./types";
import { MockPaymentProvider } from "./mock-provider";

function buildProvider(): PaymentProvider {
  const mode = process.env.PAYMENT_PROVIDER ?? "mock";

  if (mode === "mock") {
    return new MockPaymentProvider();
  }

  throw new Error(
    `PAYMENT_PROVIDER=${mode} is not yet implemented. Use PAYMENT_PROVIDER=mock until Phase 4 Razorpay integration is added.`
  );
}

export const paymentProvider: PaymentProvider = buildProvider();
