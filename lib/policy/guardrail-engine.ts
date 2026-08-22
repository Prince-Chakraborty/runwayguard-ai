import { prisma } from "@/lib/db";

export type CandidateAction = {
  type: "hold_payable" | "release_payable" | "early_settlement_request";
  targetPayableId?: string;
  amount: number;
  delayDays?: number;
  vendorCriticality?: "low" | "medium" | "critical";
  forecastConfidence: number;
};

export type GuardrailVerdict = {
  decision: "auto_execute" | "escalate" | "reject";
  reasons: string[];
};

export async function evaluateAction(merchantId: string, candidate: CandidateAction): Promise<GuardrailVerdict> {
  const policy = await getOrCreateDefaultPolicy(merchantId);
  const reasons: string[] = [];

  if (candidate.forecastConfidence < policy.minForecastConfidence) {
    reasons.push(`Forecast confidence ${(candidate.forecastConfidence * 100).toFixed(0)}% is below required ${(policy.minForecastConfidence * 100).toFixed(0)}%`);
    return { decision: "escalate", reasons };
  }

  if (policy.criticalVendorProtection && candidate.vendorCriticality === "critical" && candidate.type === "hold_payable") {
    reasons.push("Vendor marked critical — critical vendor protection policy blocks auto-hold");
    return { decision: "escalate", reasons };
  }

  if (candidate.type === "hold_payable" && (candidate.delayDays ?? 0) > policy.maxDelayDays) {
    reasons.push(`Requested delay ${candidate.delayDays} days exceeds policy max of ${policy.maxDelayDays} days`);
    return { decision: "escalate", reasons };
  }

  if (candidate.amount > policy.humanApprovalAbove) {
    reasons.push(`Amount ₹${candidate.amount} exceeds human-approval threshold of ₹${policy.humanApprovalAbove}`);
    return { decision: "escalate", reasons };
  }

  if (candidate.amount > policy.autoActionLimit) {
    reasons.push(`Amount ₹${candidate.amount} exceeds auto-action limit of ₹${policy.autoActionLimit}`);
    return { decision: "escalate", reasons };
  }

  if (candidate.type === "early_settlement_request") {
    reasons.push("Early settlement requests are treated as irreversible-adjacent — escalated by policy");
    return { decision: "escalate", reasons };
  }

  reasons.push("Within auto-action limit, delay limit, and confidence threshold");
  return { decision: "auto_execute", reasons };
}

async function getOrCreateDefaultPolicy(merchantId: string) {
  const existing = await prisma.policy.findUnique({ where: { merchantId } });
  if (existing) return existing;
  return prisma.policy.create({ data: { merchantId } });
}
