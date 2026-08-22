import { describe, it, expect, afterEach } from "vitest";
import { evaluateAction } from "@/lib/policy/guardrail-engine";
import { createTestMerchant, cleanupMerchant } from "./helpers";

describe("guardrail engine", () => {
  let merchantId: string;

  afterEach(async () => {
    if (merchantId) await cleanupMerchant(merchantId);
  });

  it("auto-executes a low-risk action within all limits", async () => {
    const merchant = await createTestMerchant();
    merchantId = merchant.id;

    const verdict = await evaluateAction(merchantId, {
      type: "hold_payable",
      amount: 20000,
      delayDays: 2,
      vendorCriticality: "low",
      forecastConfidence: 0.9,
    });

    expect(verdict.decision).toBe("auto_execute");
  });

  it("escalates when forecast confidence is below policy minimum", async () => {
    const merchant = await createTestMerchant({ minForecastConfidence: 0.85 });
    merchantId = merchant.id;

    const verdict = await evaluateAction(merchantId, {
      type: "hold_payable",
      amount: 10000,
      delayDays: 1,
      vendorCriticality: "low",
      forecastConfidence: 0.5,
    });

    expect(verdict.decision).toBe("escalate");
    expect(verdict.reasons.join(" ")).toMatch(/confidence/i);
  });

  it("escalates a critical-vendor hold regardless of amount, when protection is on", async () => {
    const merchant = await createTestMerchant({ criticalVendorProtection: true, autoActionLimit: 1000000 });
    merchantId = merchant.id;

    const verdict = await evaluateAction(merchantId, {
      type: "hold_payable",
      amount: 5000, // small amount — protection should still fire
      delayDays: 1,
      vendorCriticality: "critical",
      forecastConfidence: 0.95,
    });

    expect(verdict.decision).toBe("escalate");
    expect(verdict.reasons.join(" ")).toMatch(/critical/i);
  });

  it("does NOT escalate a critical vendor when protection is explicitly off", async () => {
    const merchant = await createTestMerchant({ criticalVendorProtection: false, autoActionLimit: 1000000 });
    merchantId = merchant.id;

    const verdict = await evaluateAction(merchantId, {
      type: "hold_payable",
      amount: 5000,
      delayDays: 1,
      vendorCriticality: "critical",
      forecastConfidence: 0.95,
    });

    expect(verdict.decision).toBe("auto_execute");
  });

  it("escalates when delay exceeds policy max", async () => {
    const merchant = await createTestMerchant({ maxDelayDays: 3 });
    merchantId = merchant.id;

    const verdict = await evaluateAction(merchantId, {
      type: "hold_payable",
      amount: 5000,
      delayDays: 10,
      vendorCriticality: "low",
      forecastConfidence: 0.95,
    });

    expect(verdict.decision).toBe("escalate");
    expect(verdict.reasons.join(" ")).toMatch(/delay/i);
  });

  it("escalates when amount exceeds the human-approval threshold", async () => {
    const merchant = await createTestMerchant({ humanApprovalAbove: 50000, autoActionLimit: 1000000 });
    merchantId = merchant.id;

    const verdict = await evaluateAction(merchantId, {
      type: "hold_payable",
      amount: 75000,
      delayDays: 1,
      vendorCriticality: "low",
      forecastConfidence: 0.95,
    });

    expect(verdict.decision).toBe("escalate");
  });

  it("always escalates early_settlement_request regardless of amount or confidence", async () => {
    const merchant = await createTestMerchant();
    merchantId = merchant.id;

    const verdict = await evaluateAction(merchantId, {
      type: "early_settlement_request",
      amount: 1000,
      forecastConfidence: 0.99,
    });

    expect(verdict.decision).toBe("escalate");
  });
});
