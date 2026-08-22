import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { runAgentCycle } from "@/lib/agent/run-agent-cycle";
import { createTestMerchant, createTestVendor, cleanupMerchant } from "./helpers";

describe("idempotency", () => {
  let merchantId: string;

  afterEach(async () => {
    if (merchantId) await cleanupMerchant(merchantId);
  });

  it("running the agent cycle twice does not create duplicate pending approvals for the same payable", async () => {
    const merchant = await createTestMerchant();
    merchantId = merchant.id;
    // amount exceeds humanApprovalAbove default (50000) -> forces escalation, not auto-execute
    const vendor = await createTestVendor(merchantId, "low");

    const payable = await prisma.payable.create({
      data: { merchantId, vendorId: vendor.id, amount: 250000, dueDate: addDays(5), status: "pending" },
    });

    await runAgentCycle(merchantId);
    await runAgentCycle(merchantId); // same unresolved risk, run again with nothing changed

    const actionsForPayable = await prisma.agentAction.findMany({
      where: { targetPayableId: payable.id, status: "pending_approval" },
    });

    // Exactly one unresolved pending approval should exist, not one per run.
    expect(actionsForPayable).toHaveLength(1);
  });

  it("auto-executed actions ARE excluded from the very next run (payable status changes)", async () => {
    const merchant = await createTestMerchant({ autoActionLimit: 1000000, humanApprovalAbove: 1000000 });
    merchantId = merchant.id;
    const vendor = await createTestVendor(merchantId, "low");

    // Amount must be large enough to actually trigger a forecasted shortfall
    // against the mock provider's base balance, or runAgentCycle correctly
    // exits early with zero actions (the "no shortfall" path) — which is
    // exactly what the previous version of this test missed.
    const payable = await prisma.payable.create({
      data: { merchantId, vendorId: vendor.id, amount: 250000, dueDate: addDays(5), status: "pending" },
    });

    const run1 = await runAgentCycle(merchantId);
    const run1Targets = run1.actions.map((a) => a.agentAction.targetPayableId);
    expect(run1Targets).toContain(payable.id);

    const run2 = await runAgentCycle(merchantId);
    const run2Targets = run2.actions.map((a) => a.agentAction.targetPayableId);
    expect(run2Targets).not.toContain(payable.id); // already held, excluded from planner input
  });

  it("rejects a duplicate idempotencyKey at the database level", async () => {
    const merchant = await createTestMerchant();
    merchantId = merchant.id;

    const run = await prisma.agentRun.create({
      data: { merchantId, forecastHorizonDays: 14, minConfidence: 0.9, shortfallDetected: false },
    });

    const key = `dupe-test-${Date.now()}`;

    await prisma.agentAction.create({
      data: { agentRunId: run.id, type: "hold_payable", amount: 1000, riskScore: 0.1, reason: "test", status: "auto_executed", idempotencyKey: key },
    });

    await expect(
      prisma.agentAction.create({
        data: { agentRunId: run.id, type: "hold_payable", amount: 1000, riskScore: 0.1, reason: "test-dupe", status: "auto_executed", idempotencyKey: key },
      })
    ).rejects.toThrow();
  });
});

function addDays(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}
