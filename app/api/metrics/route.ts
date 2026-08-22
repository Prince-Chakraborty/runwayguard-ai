import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth";
import { computeMerchantMetrics } from "@/lib/metrics/metrics";

export async function GET(req: NextRequest) {
  try {
    const { merchantId } = requireAuth(req);
    const metrics = await computeMerchantMetrics(merchantId);
    return NextResponse.json({ metrics });
  } catch (err: any) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to compute metrics" }, { status: 500 });
  }
}
