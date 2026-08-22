import { describe, it, expect, afterEach } from "vitest";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/db";
import { createTestMerchant, cleanupMerchant } from "./helpers";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.JWT_SECRET ?? "insecure-dev-fallback";

function tokenFor(merchantId: string) {
  return jwt.sign({ merchantId }, SECRET, { expiresIn: "1h" });
}

describe("approval workflow", () => {
  let merchantId: string;

  afterEach(async () => {
    if (merchantId) await cleanupMerchant(merchantId);
  });

  it("approving an action updates payable status and marks action executed", async () => {
    const merchant = await createTestMerchant();
    merchantId = merchant.id;

    const vendor = await prisma.vendor.create({ data: { merchantId, name: "V", criticality: "critical" } });
    const payable = await prisma.payable.create({
      data: { merchantId, vendorId: vendor.id, amount: 100000, dueDate: new Date(), status: "pending" },
    });
    const run = await prisma.agentRun.create({
      data: { merchantId, forecastHorizonDays: 14, minConfidence: 0.9, shortfallDetected: true },
    });
    const action = await prisma.agentAction.create({
      data: {
        agentRunId: run.id, type: "hold_payable", targetPayableId: payable.id, amount: 100000,
        riskScore: 0.8, reason: "test", status: "pending_approval", idempotencyKey: `wf-${Date.now()}`,
      },
    });
    const approval = await prisma.approval.create({ data: { agentActionId: action.id } });

    const res = await fetch(`${BASE_URL}/api/approvals`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenFor(merchantId)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId: approval.id, decision: "approved" }),
    });
    expect(res.status).toBe(200);

    const updatedPayable = await prisma.payable.findUnique({ where: { id: payable.id } });
    expect(updatedPayable?.status).toBe("held");

    const updatedAction = await prisma.agentAction.findUnique({ where: { id: action.id } });
    expect(updatedAction?.status).toBe("executed");
  });

  it("rejecting an action leaves the payable untouched", async () => {
    const merchant = await createTestMerchant();
    merchantId = merchant.id;

    const vendor = await prisma.vendor.create({ data: { merchantId, name: "V", criticality: "critical" } });
    const payable = await prisma.payable.create({
      data: { merchantId, vendorId: vendor.id, amount: 100000, dueDate: new Date(), status: "pending" },
    });
    const run = await prisma.agentRun.create({
      data: { merchantId, forecastHorizonDays: 14, minConfidence: 0.9, shortfallDetected: true },
    });
    const action = await prisma.agentAction.create({
      data: {
        agentRunId: run.id, type: "hold_payable", targetPayableId: payable.id, amount: 100000,
        riskScore: 0.8, reason: "test", status: "pending_approval", idempotencyKey: `wf-rej-${Date.now()}`,
      },
    });
    const approval = await prisma.approval.create({ data: { agentActionId: action.id } });

    await fetch(`${BASE_URL}/api/approvals`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenFor(merchantId)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId: approval.id, decision: "rejected" }),
    });

    const updatedPayable = await prisma.payable.findUnique({ where: { id: payable.id } });
    expect(updatedPayable?.status).toBe("pending"); // unchanged

    const updatedAction = await prisma.agentAction.findUnique({ where: { id: action.id } });
    expect(updatedAction?.status).toBe("rejected");
  });

  it("cannot decide the same approval twice", async () => {
    const merchant = await createTestMerchant();
    merchantId = merchant.id;

    const run = await prisma.agentRun.create({
      data: { merchantId, forecastHorizonDays: 14, minConfidence: 0.9, shortfallDetected: true },
    });
    const action = await prisma.agentAction.create({
      data: { agentRunId: run.id, type: "hold_payable", amount: 100000, riskScore: 0.8, reason: "test", status: "pending_approval", idempotencyKey: `wf-twice-${Date.now()}` },
    });
    const approval = await prisma.approval.create({ data: { agentActionId: action.id } });

    await fetch(`${BASE_URL}/api/approvals`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenFor(merchantId)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId: approval.id, decision: "approved" }),
    });

    const secondAttempt = await fetch(`${BASE_URL}/api/approvals`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenFor(merchantId)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId: approval.id, decision: "rejected" }),
    });
    expect(secondAttempt.status).toBe(409); // already decided
  });
});
