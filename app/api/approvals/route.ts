import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { paymentProvider } from "@/lib/payment-provider";
import { requireAuth, AuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { merchantId } = requireAuth(req);

    const approvals = await prisma.approval.findMany({
      where: {
        decision: "pending",
        agentAction: { agentRun: { merchantId } }, // scoped — never cross-merchant
      },
      include: {
        agentAction: { include: { agentRun: { include: { merchant: true } } } },
      },
      orderBy: { requestedAt: "desc" },
    });
    return NextResponse.json({ approvals });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to load approvals" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { merchantId } = requireAuth(req);
    const { approvalId, decision } = await req.json();

    if (!["approved", "rejected"].includes(decision)) {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
    }

    // Re-fetch scoped to the authenticated merchant — this is the line that
    // actually prevents merchant A from approving merchant B's action, even
    // if they somehow guessed a valid approvalId.
    const approval = await prisma.approval.findFirst({
      where: { id: approvalId, agentAction: { agentRun: { merchantId } } },
      include: { agentAction: true },
    });

    if (!approval) {
      return NextResponse.json({ error: "Approval not found or not authorized" }, { status: 404 });
    }

    if (approval.decision !== "pending") {
      return NextResponse.json({ error: "This approval has already been decided" }, { status: 409 });
    }

    await prisma.approval.update({
      where: { id: approvalId },
      data: { decision, decidedAt: new Date(), decidedBy: merchantId },
    });

    const action = approval.agentAction;

    if (decision === "approved" && action.targetPayableId) {
      const result = await paymentProvider.createPaymentHoldRequest(action.targetPayableId, 3);

      await prisma.payable.update({
        where: { id: action.targetPayableId },
        data: { status: "held" },
      });

      await prisma.agentAction.update({
        where: { id: action.id },
        data: { status: "executed", executedAt: new Date() },
      });

      await prisma.auditLog.create({
        data: {
          merchantId,
          actorType: "human",
          action: "approval_granted_action_executed",
          payload: { approvalId, agentActionId: action.id, providerRef: result.providerRef },
        },
      });
    } else if (decision === "rejected") {
      await prisma.agentAction.update({
        where: { id: action.id },
        data: { status: "rejected" },
      });

      await prisma.auditLog.create({
        data: {
          merchantId,
          actorType: "human",
          action: "approval_rejected",
          payload: { approvalId, agentActionId: action.id },
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Approval decision failed:", err);
    return NextResponse.json({ error: err.message ?? "Approval decision failed" }, { status: 500 });
  }
}
