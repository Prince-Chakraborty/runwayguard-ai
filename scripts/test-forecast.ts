import "dotenv/config";
import { prisma } from "../lib/db";
import { runForecast } from "../lib/forecast/forecast-engine";
import { evaluateAction, CandidateAction } from "../lib/policy/guardrail-engine";

async function main() {
  const merchant = await prisma.merchant.findFirst({ orderBy: { createdAt: "desc" } });
  if (!merchant) {
    console.error("No merchant found. Run the seed script first.");
    process.exit(1);
  }
  console.log(`\n=== Forecasting for merchant: ${merchant.name} (${merchant.id}) ===\n`);

  const forecast = await runForecast(merchant.id, 14);

  console.log("Day | Date       | Projected Balance | Confidence");
  console.log("----|------------|--------------------|-----------");
  forecast.points.forEach((p, i) => {
    const dateStr = p.date.toISOString().slice(0, 10);
    const bal = p.projectedBalance.toString().padStart(10);
    console.log(`${i.toString().padStart(3)} | ${dateStr} | ${bal}         | ${(p.confidence * 100).toFixed(0)}%`);
  });

  console.log(`\nShortfall detected: ${forecast.shortfallDetected}`);

  // Confidence relevant to a decision is the forecast's confidence AT the
  // point the shortfall occurs (near-term, mostly-known data) — not the
  // lowest point in the whole 14-day tail, which would drown out every
  // other guardrail rule.
  let decisionConfidence = forecast.points[0].confidence;
  if (forecast.shortfallDate) {
    const match = forecast.points.find(
      (p) => p.date.toISOString().slice(0, 10) === forecast.shortfallDate!.toISOString().slice(0, 10)
    );
    if (match) decisionConfidence = match.confidence;
    console.log(`Shortfall date: ${forecast.shortfallDate.toISOString().slice(0, 10)} (confidence at that point: ${(decisionConfidence * 100).toFixed(0)}%)`);
  }

  console.log("\n=== Testing guardrail engine against candidate actions ===\n");

  const payables = await prisma.payable.findMany({
    where: { merchantId: merchant.id, status: "pending" },
    include: { vendor: true },
  });

  for (const payable of payables) {
    const candidate: CandidateAction = {
      type: "hold_payable",
      targetPayableId: payable.id,
      amount: payable.amount,
      delayDays: 3,
      vendorCriticality: payable.vendor.criticality as "low" | "medium" | "critical",
      forecastConfidence: decisionConfidence,
    };

    const verdict = await evaluateAction(merchant.id, candidate);

    console.log(
      `Payable ₹${payable.amount} to ${payable.vendor.name} (${payable.vendor.criticality}) → ${verdict.decision.toUpperCase()}`
    );
    verdict.reasons.forEach((r) => console.log(`   - ${r}`));
    console.log("");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
