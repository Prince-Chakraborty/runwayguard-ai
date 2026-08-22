import "dotenv/config";
import { prisma } from "../lib/db";
import { runAgentCycle } from "../lib/agent/run-agent-cycle";

async function main() {
  const merchant = await prisma.merchant.findFirst({ orderBy: { createdAt: "desc" } });
  if (!merchant) {
    console.error("No merchant found. Run the seed script first.");
    process.exit(1);
  }

  console.log(`\n=== Idempotency test for: ${merchant.name} ===\n`);

  console.log("--- Run 1 ---");
  const run1 = await runAgentCycle(merchant.id);
  const run1Targets = run1.actions.map((a) => a.agentAction.targetPayableId).filter(Boolean);
  console.log(`Run 1 processed ${run1.actions.length} action(s) against payables:`, run1Targets);

  console.log("\n--- Run 2 (immediately after, same merchant, no state change in between) ---");
  const run2 = await runAgentCycle(merchant.id);
  const run2Targets = run2.actions.map((a) => a.agentAction.targetPayableId).filter(Boolean);
  console.log(`Run 2 processed ${run2.actions.length} action(s) against payables:`, run2Targets);

  const overlap = run1Targets.filter((id) => run2Targets.includes(id));
  console.log(`\nPayables reprocessed in both runs: ${overlap.length === 0 ? "NONE (correct)" : overlap.join(", ") + " — BUG"}`);

  console.log("\n--- Direct DB-level constraint test ---");
  console.log("Attempting to insert two AgentActions with the identical idempotencyKey...");

  const dupeKey = `idempotency-test-${Date.now()}`;
  await prisma.agentAction.create({
    data: {
      agentRunId: run1.agentRun.id,
      type: "hold_payable",
      amount: 1000,
      riskScore: 0.1,
      reason: "Idempotency test — first insert",
      status: "auto_executed",
      idempotencyKey: dupeKey,
    },
  });
  console.log("First insert with key succeeded (expected).");

  try {
    await prisma.agentAction.create({
      data: {
        agentRunId: run1.agentRun.id,
        type: "hold_payable",
        amount: 1000,
        riskScore: 0.1,
        reason: "Idempotency test — duplicate insert",
        status: "auto_executed",
        idempotencyKey: dupeKey,
      },
    });
    console.log("Second insert with SAME key succeeded — THIS IS A BUG. Unique constraint did not fire.");
  } catch (e: any) {
    if (e.code === "P2002") {
      console.log("Second insert with same key correctly REJECTED by unique constraint (P2002). Idempotency guaranteed at the DB level.");
    } else {
      console.log("Second insert failed, but not with the expected P2002 error:", e.message);
    }
  }

  // Cleanup the synthetic test row
  await prisma.agentAction.deleteMany({ where: { idempotencyKey: dupeKey } });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
