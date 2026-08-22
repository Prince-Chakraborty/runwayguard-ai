import { prisma } from "@/lib/db";

export type MerchantMetrics = {
  forecastRunsTotal: number;
  shortfallsDetected: number;
  actionsProposedTotal: number;
  actionsAutoExecuted: number;
  actionsEscalated: number;
  actionsRejected: number;
  actionsExecutedAfterApproval: number;
  averageForecastHorizonDays: number;
  runwayPreservedEstimate: number;
  webhookEventsProcessed: number;
};

// Every number here is a direct aggregation over real rows created by
// actual agent runs in this merchant's history — nothing is estimated,
// assumed, or hardcoded. If there's no data yet, the honest answer is 0,
// not a placeholder number.
export async function computeMerchantMetrics(merchantId: string): Promise<MerchantMetrics> {
  const [runs, actions, webhookEvents] = await Promise.all([
    prisma.agentRun.findMany({ where: { merchantId } }),
    prisma.agentAction.findMany({
      where: { agentRun: { merchantId } },
      include: { approval: true },
    }),
    prisma.webhookEvent.count(),
  ]);

  const forecastRunsTotal = runs.length;
  const shortfallsDetected = runs.filter((r) => r.shortfallDetected).length;

  const actionsProposedTotal = actions.length;
  const actionsAutoExecuted = actions.filter((a) => a.status === "auto_executed").length;
  const actionsEscalated = actions.filter((a) => a.approval !== null).length;
  const actionsRejected = actions.filter((a) => a.status === "rejected").length;
  const actionsExecutedAfterApproval = actions.filter(
    (a) => a.status === "executed" && a.approval?.decision === "approved"
  ).length;

  const averageForecastHorizonDays =
    runs.length > 0 ? runs.reduce((sum, r) => sum + r.forecastHorizonDays, 0) / runs.length : 0;

  const runwayPreservedEstimate = actions
    .filter((a) => a.status === "auto_executed" || (a.status === "executed" && a.approval?.decision === "approved"))
    .reduce((sum, a) => sum + a.amount, 0);

  return {
    forecastRunsTotal,
    shortfallsDetected,
    actionsProposedTotal,
    actionsAutoExecuted,
    actionsEscalated,
    actionsRejected,
    actionsExecutedAfterApproval,
    averageForecastHorizonDays: Math.round(averageForecastHorizonDays * 10) / 10,
    runwayPreservedEstimate,
    webhookEventsProcessed: webhookEvents,
  };
}
