import "dotenv/config";
import { prisma } from "../lib/db";
import { runAgentCycle } from "../lib/agent/run-agent-cycle";

async function main() {
  const merchant = await prisma.merchant.findFirst({ orderBy: { createdAt: "desc" } });
  if (!merchant) {
    console.error("No merchant found. Run seed-batch.ts first.");
    process.exit(1);
  }

  const totalPayables = await prisma.payable.count({ where: { merchantId: merchant.id } });
  console.log(`\n=== Batch Evaluation: ${merchant.name} ===`);
  console.log(`Total records (payables) in batch: ${totalPayables}\n`);

  const startTime = Date.now();
  const result = await runAgentCycle(merchant.id);
  const elapsedMs = Date.now() - startTime;

  const autoExecuted = result.actions.filter((a) => a.agentAction.status === "auto_executed");
  const escalated = result.actions.filter((a) => a.agentAction.status === "pending_approval");
  const totalProposed = result.actions.length;

  // Auto-resolution rate = proportion of proposed actions the agent could
  // execute autonomously within policy limits vs. had to escalate as an
  // exception for human judgment. This is deliberately NOT called "match
  // rate" unless a specific external rubric defines that term differently
  // -- it is simply the automation rate under the configured guardrails.
  const noActionNeeded = totalPayables - totalProposed;
  const autoResolutionRate = totalProposed > 0 ? (autoExecuted.length / totalProposed) * 100 : 0;
  const throughputPerSec = totalPayables / (elapsedMs / 1000);

  console.log("--- Results ---");
  console.log(`Shortfall detected: ${result.agentRun.shortfallDetected}`);
  console.log(`Records requiring no action (forecast healthy for that payable): ${noActionNeeded}`);
  console.log(`Records with a proposed intervention: ${totalProposed}`);
  console.log(`  Auto-resolved (within guardrail limits): ${autoExecuted.length}`);
  console.log(`  Exceptions (escalated for human approval): ${escalated.length}`);
  console.log(`Auto-resolution rate (auto-resolved / proposed): ${autoResolutionRate.toFixed(1)}%`);
  console.log(`Processing time: ${elapsedMs}ms`);
  console.log(`Throughput: ${throughputPerSec.toFixed(1)} records/sec\n`);

  console.log("--- Exceptions (unresolved, require human decision) ---");
  if (escalated.length === 0) {
    console.log("None.");
  } else {
    escalated.forEach((a) => {
      console.log(`- Payable ${a.agentAction.targetPayableId}: ₹${a.agentAction.amount} — ${a.verdict.reasons.join("; ")}`);
    });
  }

  console.log("\n--- Auto-resolved (sample of 5) ---");
  autoExecuted.slice(0, 5).forEach((a) => {
    console.log(`- Payable ${a.agentAction.targetPayableId}: ₹${a.agentAction.amount} — ${a.verdict.reasons.join("; ")}`);
  });

  console.log("\n=== Summary for reporting ===");
  console.log(JSON.stringify({
    totalRecords: totalPayables,
    noActionNeeded,
    proposedActions: totalProposed,
    autoResolved: autoExecuted.length,
    exceptions: escalated.length,
    autoResolutionRatePercent: Number(autoResolutionRate.toFixed(1)),
    processingTimeMs: elapsedMs,
    throughputRecordsPerSec: Number(throughputPerSec.toFixed(1)),
  }, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
