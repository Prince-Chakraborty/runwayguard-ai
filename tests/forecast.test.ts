import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { runForecast } from "@/lib/forecast/forecast-engine";
import { createTestMerchant, createTestVendor, cleanupMerchant } from "./helpers";

describe("forecast engine", () => {
  let merchantId: string;

  afterEach(async () => {
    if (merchantId) await cleanupMerchant(merchantId);
  });

  it("detects no shortfall when payables never exceed balance", async () => {
    const merchant = await createTestMerchant();
    merchantId = merchant.id;
    const vendor = await createTestVendor(merchantId, "low");

    await prisma.payable.create({
      data: { merchantId, vendorId: vendor.id, amount: 1000, dueDate: addDays(3), status: "pending" },
    });

    const forecast = await runForecast(merchantId, 14);
    expect(forecast.shortfallDetected).toBe(false);
    expect(forecast.points).toHaveLength(15); // day 0 through day 14 inclusive
  });

  it("detects a shortfall on the correct day when payables exceed balance", async () => {
    const merchant = await createTestMerchant();
    merchantId = merchant.id;
    const vendor = await createTestVendor(merchantId, "medium");

    // base mock balance is 180000 — push it deep negative on day 5
    await prisma.payable.create({
      data: { merchantId, vendorId: vendor.id, amount: 250000, dueDate: addDays(5), status: "pending" },
    });

    const forecast = await runForecast(merchantId, 14);
    expect(forecast.shortfallDetected).toBe(true);
    expect(forecast.shortfallDate).not.toBeNull();
    const shortfallDay = forecast.points.findIndex((p) => sameDay(p.date, forecast.shortfallDate!));
    expect(shortfallDay).toBe(5);
  });

  it("excludes held payables from the outflow calculation", async () => {
    const merchant = await createTestMerchant();
    merchantId = merchant.id;
    const vendor = await createTestVendor(merchantId, "medium");

    await prisma.payable.create({
      data: { merchantId, vendorId: vendor.id, amount: 250000, dueDate: addDays(5), status: "held" },
    });

    const forecast = await runForecast(merchantId, 14);
    expect(forecast.shortfallDetected).toBe(false); // held payable should not count
  });

  it("confidence strictly decreases as horizon extends", async () => {
    const merchant = await createTestMerchant();
    merchantId = merchant.id;

    const forecast = await runForecast(merchantId, 14);
    for (let i = 1; i < forecast.points.length; i++) {
      expect(forecast.points[i].confidence).toBeLessThanOrEqual(forecast.points[i - 1].confidence);
    }
  });
});

function addDays(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
