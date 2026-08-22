import { describe, it, expect, beforeAll, afterEach } from "vitest";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/db";
import { createTestMerchant, cleanupMerchant } from "./helpers";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.JWT_SECRET ?? "insecure-dev-fallback";

function tokenFor(merchantId: string) {
  return jwt.sign({ merchantId }, SECRET, { expiresIn: "1h" });
}

describe("authorization", () => {
  let merchantAId: string;
  let merchantBId: string;

  afterEach(async () => {
    if (merchantAId) await cleanupMerchant(merchantAId);
    if (merchantBId) await cleanupMerchant(merchantBId);
  });

  it("rejects requests with no Authorization header", async () => {
    const res = await fetch(`${BASE_URL}/api/payables`);
    expect(res.status).toBe(401);
  });

  it("rejects requests with an invalid token", async () => {
    const res = await fetch(`${BASE_URL}/api/payables`, {
      headers: { Authorization: "Bearer not-a-real-token" },
    });
    expect(res.status).toBe(401);
  });

  it("merchant A cannot see or approve merchant B's pending approval", async () => {
    const merchantA = await createTestMerchant();
    const merchantB = await createTestMerchant();
    merchantAId = merchantA.id;
    merchantBId = merchantB.id;

    // Create a pending approval belonging to merchant B
    const run = await prisma.agentRun.create({
      data: { merchantId: merchantB.id, forecastHorizonDays: 14, minConfidence: 0.9, shortfallDetected: true },
    });
    const action = await prisma.agentAction.create({
      data: {
        agentRunId: run.id,
        type: "hold_payable",
        amount: 999999,
        riskScore: 0.9,
        reason: "cross-tenant test",
        status: "pending_approval",
        idempotencyKey: `cross-tenant-${Date.now()}`,
      },
    });
    const approval = await prisma.approval.create({ data: { agentActionId: action.id } });

    // Merchant A's approvals list should NOT contain merchant B's approval
    const listRes = await fetch(`${BASE_URL}/api/approvals`, {
      headers: { Authorization: `Bearer ${tokenFor(merchantA.id)}` },
    });
    const listData = await listRes.json();
    const leaked = listData.approvals.some((a: any) => a.id === approval.id);
    expect(leaked).toBe(false);

    // Merchant A attempting to PATCH merchant B's approval should be rejected
    const patchRes = await fetch(`${BASE_URL}/api/approvals`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenFor(merchantA.id)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId: approval.id, decision: "approved" }),
    });
    expect(patchRes.status).toBe(404); // "not found or not authorized" — scoped query returns nothing

    const unchanged = await prisma.approval.findUnique({ where: { id: approval.id } });
    expect(unchanged?.decision).toBe("pending"); // must NOT have been approved
  });
});
