import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";

// This endpoint is what a REAL Razorpay webhook would POST to. It's built
// now, ahead of real credentials, so the integration boundary is proven
// end-to-end — signature verification, idempotency, and event application
// all work today against a simulated payload, and need zero changes once
// RAZORPAY_WEBHOOK_SECRET is a real value from the Razorpay dashboard.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (secret) {
    // Real verification path — only runs once a real webhook secret is configured.
    if (!signature) {
      return NextResponse.json({ error: "Missing signature header" }, { status: 400 });
    }
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    if (!valid) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
  } else {
    console.warn("[webhook] RAZORPAY_WEBHOOK_SECRET not set — running in unverified mock-mode. Do not use this path for real traffic.");
  }

  let event: { id: string; event: string; payload: any };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!event.id || !event.event) {
    return NextResponse.json({ error: "Payload missing required id/event fields" }, { status: 400 });
  }

  // Idempotency: providerEventId is unique — a redelivered webhook is a no-op.
  const existing = await prisma.webhookEvent.findUnique({ where: { providerEventId: event.id } });
  if (existing) {
    return NextResponse.json({ status: "already_processed" });
  }

  await prisma.webhookEvent.create({
    data: {
      providerEventId: event.id,
      type: event.event,
      payload: event.payload ?? {},
      processedAt: new Date(),
    },
  });

  // Real implementation would branch on event.event here (e.g.
  // "payout.processed", "payout.failed") and update the matching
  // AgentAction/Payable status. Left as a clear extension point rather
  // than guessing at undocumented event shapes.

  return NextResponse.json({ status: "processed" });
}
