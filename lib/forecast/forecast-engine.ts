import { prisma } from "@/lib/db";
import { paymentProvider } from "@/lib/payment-provider";

export type ForecastPoint = {
  date: Date;
  projectedBalance: number;
  confidence: number;
};

export type ForecastResult = {
  points: ForecastPoint[];
  shortfallDetected: boolean;
  shortfallDate: Date | null;
  minConfidence: number;
};

export async function runForecast(merchantId: string, horizonDays = 14): Promise<ForecastResult> {
  const currentBalance = await paymentProvider.getAccountBalance(merchantId);

  const [payables, settlements] = await Promise.all([
    prisma.payable.findMany({
      where: { merchantId, status: { in: ["pending", "held"] } },
      include: { vendor: true },
    }),
    prisma.settlement.findMany({
      where: { merchantId, status: "expected" },
    }),
  ]);

  const points: ForecastPoint[] = [];
  let runningBalance = currentBalance;
  let shortfallDate: Date | null = null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i <= horizonDays; i++) {
    const day = new Date(today);
    day.setDate(day.getDate() + i);

    const dueToday = payables.filter((p) => p.status === "pending" && sameDay(p.dueDate, day));
    const settlingToday = settlements.filter((s) => sameDay(s.expectedDate, day));

    runningBalance -= dueToday.reduce((sum, p) => sum + p.amount, 0);
    runningBalance += settlingToday.reduce((sum, s) => sum + s.amount, 0);

    const confidence = Math.max(0.5, 1 - i * 0.015);

    if (runningBalance < 0 && !shortfallDate) {
      shortfallDate = new Date(day);
    }

    points.push({ date: day, projectedBalance: runningBalance, confidence });
  }

  return {
    points,
    shortfallDetected: shortfallDate !== null,
    shortfallDate,
    minConfidence: Math.min(...points.map((p) => p.confidence)),
  };
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
