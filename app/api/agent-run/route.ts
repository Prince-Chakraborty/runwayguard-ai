import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runAgentCycle } from "@/lib/agent/run-agent-cycle";
import { requireAuth, AuthError } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { merchantId } = requireAuth(req);

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) {
      return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
    }

    const result = await runAgentCycle(merchant.id);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Agent run failed:", err);
    return NextResponse.json({ error: err.message ?? "Agent run failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { merchantId } = requireAuth(req);

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) return NextResponse.json({ error: "Merchant not found" }, { status: 404 });

    const runs = await prisma.agentRun.findMany({
      where: { merchantId: merchant.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        snapshots: { orderBy: { date: "asc" } },
        actions: { include: { approval: true } },
      },
    });

    return NextResponse.json({ merchant, runs });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to load agent runs" }, { status: 500 });
  }
}
