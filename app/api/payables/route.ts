import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const { merchantId } = requireAuth(req);

    const payables = await prisma.payable.findMany({
      where: { merchantId },
      include: { vendor: true },
      orderBy: { dueDate: "asc" },
    });

    return NextResponse.json({ payables });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to load payables" }, { status: 500 });
  }
}
