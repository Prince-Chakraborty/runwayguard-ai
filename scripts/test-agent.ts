import "dotenv/config";
import { prisma } from "../lib/db";
import { runAgentCycle } from "../lib/agent/run-agent-cycle";

async function main() {
  const merchant = await prisma.merchant.findFirst({ orderBy: { createdAt: "desc" } });
  if (!merchant) {
    console.error("No merchant found. Run the seed script first.");
    process.exit(1);
  }

  console.log(`\n=== Running agent cycle for: ${merchant.name} ===\n`);
  const result = await runAgentCycle(merchant.id);

  console.log("AgentRun ID:", result.agentRun.id);
  console.log("Shortfall detected:", result.agentRun.shortfallDetected);

  if (result.plan) {
    console.log("\nPlan summary:", result.plan.summary);
  }

  console.log(`\n${result.actions.length} action(s) processed:\n`);
  for (const { agentAction, verdict } of result.actions) {
    console.log(`- ₹${agentAction.amount} | ${agentAction.type} | ${agentAction.status.toUpperCase()}`);
    console.log(`  Reason: ${agentAction.reason}`);
  }

  console.log("\n=== Audit log for this merchant ===\n");
  const logs = await prisma.auditLog.findMany({
    where: { merchantId: merchant.id },
    orderBy: { createdAt: "asc" },
  });
  logs.forEach((l) => console.log(`[${l.actorType}] ${l.action}`));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
