import { Planner, PlannerInput, Plan } from "./types";

// Deterministic, rule-based planner. Mirrors the reasoning shape an LLM
// planner would produce, so the two are interchangeable behind the same
// interface. This is what runs when ANTHROPIC_API_KEY is not configured —
// the demo works end-to-end without any AI credential.
export class HeuristicPlanner implements Planner {
  name = "heuristic-v1";

  async planInterventions(input: PlannerInput): Promise<Plan> {
    if (!input.shortfallDetected) {
      return {
        summary: `No shortfall predicted for ${input.merchantName} in the forecast window.`,
        interventions: [],
      };
    }

    // Prioritize holding the least-critical, smallest payables first —
    // this mirrors "minimize business relationship harm" reasoning
    // without needing an LLM call to arrive at a sensible ordering.
    const criticalityRank: Record<string, number> = { low: 0, medium: 1, critical: 2 };
    const sorted = [...input.payables].sort((a, b) => {
      const rankDiff = criticalityRank[a.vendorCriticality] - criticalityRank[b.vendorCriticality];
      if (rankDiff !== 0) return rankDiff;
      return a.amount - b.amount;
    });

    const interventions = sorted.map((p) => ({
      type: "hold_payable" as const,
      targetPayableId: p.id,
      amount: p.amount,
      delayDays: 3,
      reason: `Holding payment to ${p.vendorName} (₹${p.amount}, ${p.vendorCriticality} priority) for 3 days to protect runway ahead of the predicted shortfall on ${input.shortfallDate}.`,
    }));

    return {
      summary: `Shortfall of ₹${Math.abs(input.shortfallAmount ?? 0)} predicted around ${input.shortfallDate}. Proposing ${interventions.length} payable hold(s), prioritized by vendor criticality.`,
      interventions,
    };
  }
}
