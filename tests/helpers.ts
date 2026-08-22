import { prisma } from "@/lib/db";

export async function createTestMerchant(overrides?: {
  autoActionLimit?: number;
  maxDelayDays?: number;
  minForecastConfidence?: number;
  criticalVendorProtection?: boolean;
  humanApprovalAbove?: number;
}) {
  const merchant = await prisma.merchant.create({
    data: { name: `Test Merchant ${Date.now()}-${Math.random().toString(36).slice(2)}`, mode: "mock" },
  });

  await prisma.policy.create({
    data: {
      merchantId: merchant.id,
      autoActionLimit: overrides?.autoActionLimit ?? 50000,
      maxDelayDays: overrides?.maxDelayDays ?? 3,
      minForecastConfidence: overrides?.minForecastConfidence ?? 0.85,
      criticalVendorProtection: overrides?.criticalVendorProtection ?? true,
      humanApprovalAbove: overrides?.humanApprovalAbove ?? 50000,
    },
  });

  return merchant;
}

export async function createTestVendor(merchantId: string, criticality: "low" | "medium" | "critical" = "medium") {
  return prisma.vendor.create({
    data: { merchantId, name: `Vendor ${Math.random().toString(36).slice(2)}`, criticality },
  });
}

export async function cleanupMerchant(merchantId: string) {
  // Delete in FK-safe order
  await prisma.auditLog.deleteMany({ where: { merchantId } });
  await prisma.approval.deleteMany({ where: { agentAction: { agentRun: { merchantId } } } });
  await prisma.agentAction.deleteMany({ where: { agentRun: { merchantId } } });
  await prisma.cashPositionSnapshot.deleteMany({ where: { merchantId } });
  await prisma.agentRun.deleteMany({ where: { merchantId } });
  await prisma.payable.deleteMany({ where: { merchantId } });
  await prisma.settlement.deleteMany({ where: { merchantId } });
  await prisma.vendor.deleteMany({ where: { merchantId } });
  await prisma.policy.deleteMany({ where: { merchantId } });
  await prisma.merchant.delete({ where: { id: merchantId } });
}
