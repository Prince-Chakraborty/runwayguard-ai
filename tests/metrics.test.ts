import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { runAgentCycle } from "@/lib/agent/run-agent-cycle";
import { computeMerchantMetrics } from "@/lib/metrics/metrics";
import { createTestMerchant, createTestVendor, cleanupMerchant } from "./helpers";

describe("metrics", () => {
  let merchantId: string;

  afterEach(async () => {
    if (merchantId) await cleanupMerchant(merchantId);
  });

  it("returns all zeros for a merchant with no history", async () => {
    const merchant = await createTestMerchant();
    merchantId = merchant.id;

    const metrics = await computeMerchantMetrics(merchantId);
    expect(metrics.forecastRunsTotal).toBe(0);
    expect(metrics.shortfallsDetected).toBe(0);
    expect(metrics.runwayPreservedEstimate).toBe(0);
  });

  it("accurately counts auto-executed vs escalated actions after a real run", async () => {
    const merchant = await createTestMerchant({ autoActionLimit: 50000, humanApprovalAbove: 50000 });
    merchantId = merchant.id;

    const lowVendor = await createTestVendor(merchantId, "low");
    const criticalVendor = await createTestVendor(merchantId, "critical");

    await prisma.payable.create({
      data: { merchantId, vendorId: lowVendor.id, amount: 30000, dueDate: addDays(4), status: "pending" },
    });
    await prisma.payable.create({
      data: { merchantId, vendorId: criticalVendor.id, amount: 200000, dueDate: addDays(5), status: "pending" },
    });

    await runAgentCycle(merchantId);

    const metrics = await computeMerchantMetrics(merchantId);
    expect(metrics.forecastRunsTotal).toBe(1);
    expect(metrics.shortfallsDetected).toBe(1);
    expect(metrics.actionsProposedTotal).toBe(2);
    expect(metrics.actionsAutoExecuted).toBe(1);
    expect(metrics.actionsEscalated).toBe(1);
    expect(metrics.runwayPreservedEstimate).toBe(30000);
  });

  it("runwayPreservedEstimate increases after an escalated action is approved", async () => {
    const merchant = await createTestMerchant({ autoActionLimit: 50000, humanApprovalAbove: 50000 });
    merchantId = merchant.id;
    const criticalVendor = await createTestVendor(merchantId, "critical");

    await prisma.payable.create({
      data: { merchantId, vendorId: criticalVendor.id, amount: 200000, dueDate: addDays(5), status: "pending" },
    });

    const result = await runAgentCycle(merchantId);
    const escalatedAction = result.actions.find((a) => a.agentAction.status === "pending_approval");
    expect(escalatedAction).toBeDefined();

    const approval = await prisma.approval.findUnique({ where: { agentActionId: escalatedAction!.agentAction.id } });
    await prisma.approval.update({ where: { id: approval!.id }, data: { decision: "approved", decidedAt: new Date() } });
    await prisma.agentAction.update({ where: { id: escalatedAction!.agentAction.id }, data: { status: "executed", executedAt: new Date() } });

    const metrics = await computeMerchantMetrics(merchantId);
    expect(metrics.actionsExecutedAfterApproval).toBe(1);
    expect(metrics.runwayPreservedEstimate).toBe(200000);
  });
});

function addDays(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}
