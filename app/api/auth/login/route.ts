import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signMerchantToken } from "@/lib/auth";

// Demo-scale login: one merchant, one password, sourced from env.
// This is intentionally simple for a hackathon single-tenant demo —
// but it's a REAL password check + signed JWT, not a bypassed stub.
// Multi-merchant signup/password-per-account would be the production version.
export async function POST(req: NextRequest) {
  const { password } = await req.json();

  const demoPasswordHash = process.env.DEMO_MERCHANT_PASSWORD_HASH;
  if (!demoPasswordHash) {
    return NextResponse.json(
      { error: "Server misconfigured: DEMO_MERCHANT_PASSWORD_HASH not set." },
      { status: 500 }
    );
  }

  const valid = await bcrypt.compare(password ?? "", demoPasswordHash);
  if (!valid) {
    // TEMPORARY DIAGNOSTIC - remove after debugging
    return NextResponse.json({
      error: "Invalid credentials",
      debug: {
        hashLength: demoPasswordHash.length,
        hashFirst10: demoPasswordHash.slice(0, 10),
        hashLast4: demoPasswordHash.slice(-4),
        passwordReceived: password ?? "(none)",
      }
    }, { status: 401 });
  }

  const merchant = await prisma.merchant.findFirst({ orderBy: { createdAt: "desc" } });
  if (!merchant) {
    return NextResponse.json({ error: "No merchant record found. Seed the database first." }, { status: 404 });
  }

  const token = signMerchantToken(merchant.id);
  return NextResponse.json({ token, merchantId: merchant.id, merchantName: merchant.name });
}
