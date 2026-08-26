import { PaymentProvider } from "./types";
import { MockPaymentProvider } from "./mock-provider";
import { RazorpayPaymentProvider } from "./razorpay-provider";

function buildProvider(): PaymentProvider {
  const mode = process.env.PAYMENT_PROVIDER ?? "mock";

  if (mode === "mock") {
    return new MockPaymentProvider();
  }

  if (mode === "razorpay") {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new Error(
        "PAYMENT_PROVIDER=razorpay requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to be set."
      );
    }
    return new RazorpayPaymentProvider(keyId, keySecret);
  }

  throw new Error(`Unknown PAYMENT_PROVIDER: ${mode}. Use "mock" or "razorpay".`);
}

export const paymentProvider: PaymentProvider = buildProvider();
