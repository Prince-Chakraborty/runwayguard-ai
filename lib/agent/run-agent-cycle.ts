import { prisma } from "@/lib/db";
import { runForecast } from "@/lib/forecast/forecast-engine";
import { evaluateAction } from "@/lib/policy/guardrail-engine";
import { paymentProvider } from "@/lib/payment-provider";
import { planner } from "./orchestrator";

export async function runAgentCycle(merchantId: string) {
  const merchant = await prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });

  const forecast = await runForecast(merchantId, 14);

  const agentRun = await prisma.agentRun.create({
    data: {
      merchantId,
      forecastHorizonDays: 14,
      minConfidence: forecast.minConfidence,
      shortfallDetected: forecast.shortfallDetected,
    },
  });

  await prisma.cashPositionSnapshot.createMany({
    data: forecast.points.map((p) => ({
      merchantId,
      agentRunId: agentRun.id,
      date: p.date,
      projectedBalance: p.projectedBalance,
      confidence: p.confidence,
    })),
  });

  await logAudit(merchantId, "system", "forecast_completed", {
    agentRunId: agentRun.id,
    shortfallDetected: forecast.shortfallDetected,
    shortfallDate: forecast.shortfallDate,
  });

  if (!forecast.shortfallDetected) {
    await logAudit(merchantId, "agent", "no_action_needed", { agentRunId: agentRun.id });
    return { agentRun, plan: null, actions: [] };
  }

  const payables = await prisma.payable.findMany({
    where: { merchantId, status: "pending" },
    include: { vendor: true },
  });

  const shortfallPoint = forecast.points.find(
    (p) => forecast.shortfallDate && p.date.toISOString().slice(0, 10) === forecast.shortfallDate.toISOString().slice(0, 10)
  );
  const decisionConfidence = shortfallPoint?.confidence ?? forecast.minConfidence;

  const plan = await planner.planInterventions({
    merchantName: merchant.name,
    shortfallDetected: true,
    shortfallDate: forecast.shortfallDate?.toISOString().slice(0, 10) ?? null,
    shortfallAmount: shortfallPoint?.projectedBalance ?? null,
    payables: payables.map((p) => ({
      id: p.id,
      vendorName: p.vendor.name,
      vendorCriticality: p.vendor.criticality,
      amount: p.amount,
      dueDate: p.dueDate.toISOString().slice(0, 10),
    })),
  });

  await logAudit(merchantId, "agent", "plan_proposed", {
    agentRunId: agentRun.id,
    planner: planner.name,
    summary: plan.summary,
    interventionCount: plan.interventions.length,
  });

  const actions = [];

  for (const intervention of plan.interventions) {
    const payable = payables.find((p) => p.id === intervention.targetPayableId);

    // Don't re-escalate a payable that already has an unresolved pending
    // approval from a previous run — the human hasn't decided yet, so
    // proposing it again would just clutter the queue with duplicates.
    if (intervention.targetPayableId) {
      const alreadyPending = await prisma.agentAction.findFirst({
        where: {
          targetPayableId: intervention.targetPayableId,
          status: "pending_approval",
        },
      });
      if (alreadyPending) {
        await logAudit(merchantId, "system", "escalation_already_pending", {
          agentRunId: agentRun.id,
          targetPayableId: intervention.targetPayableId,
          existingAgentActionId: alreadyPending.id,
        });
        continue;
      }
    }

    const verdict = await evaluateAction(merchantId, {
      type: intervention.type,
      targetPayableId: intervention.targetPayableId,
      amount: intervention.amount,
      delayDays: intervention.delayDays,
      vendorCriticality: (payable?.vendor.criticality as "low" | "medium" | "critical") ?? "medium",
      forecastConfidence: decisionConfidence,
    });

    const idempotencyKey = `${agentRun.id}-${intervention.targetPayableId}-${intervention.type}`;

    const agentAction = await prisma.agentAction.create({
      data: {
        agentRunId: agentRun.id,
        type: intervention.type,
        targetPayableId: intervention.targetPayableId ?? null,
        amount: intervention.amount,
        riskScore: verdict.decision === "auto_execute" ? 0.2 : 0.8,
        reason: `${intervention.reason} | Guardrail: ${verdict.reasons.join("; ")}`,
        status: verdict.decision === "auto_execute" ? "auto_executed" : "pending_approval",
        idempotencyKey,
      },
    });

    if (verdict.decision === "auto_execute" && intervention.targetPayableId) {
      const result = await paymentProvider.createPaymentHoldRequest(
        intervention.targetPayableId,
        intervention.delayDays ?? 3
      );

      await prisma.payable.update({
        where: { id: intervention.targetPayableId },
        data: { status: "held" },
      });

      await prisma.agentAction.update({
        where: { id: agentAction.id },
        data: { executedAt: new Date() },
      });

      await logAudit(merchantId, "agent", "action_auto_executed", {
        agentActionId: agentAction.id,
        providerRef: result.providerRef,
        simulated: result.simulated,
      });
    } else {
      await prisma.approval.create({
        data: { agentActionId: agentAction.id },
      });

      await logAudit(merchantId, "agent", "action_escalated", {
        agentActionId: agentAction.id,
        reasons: verdict.reasons,
      });
    }

    actions.push({ agentAction, verdict });
  }

  return { agentRun, plan, actions };
}

async function logAudit(merchantId: string, actorType: "agent" | "human" | "system", action: string, payload: object) {
  await prisma.auditLog.create({
    data: { merchantId, actorType, action, payload: payload as any },
  });
}
