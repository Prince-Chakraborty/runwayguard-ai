import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding RunwayGuard demo data...");

  const merchant = await prisma.merchant.create({
    data: { name: "Kolkata Crafts & Co.", mode: "mock" },
  });

  await prisma.policy.create({
    data: {
      merchantId: merchant.id,
      autoActionLimit: 50000,
      maxDelayDays: 3,
      minForecastConfidence: 0.85,
      criticalVendorProtection: true,
      humanApprovalAbove: 50000,
    },
  });

  const criticalVendor = await prisma.vendor.create({
    data: { merchantId: merchant.id, name: "Prime Fabric Suppliers", criticality: "critical", paymentHistoryScore: 0.95 },
  });

  const mediumVendor = await prisma.vendor.create({
    data: { merchantId: merchant.id, name: "QuickPack Logistics", criticality: "medium", paymentHistoryScore: 0.8 },
  });

  const lowVendor = await prisma.vendor.create({
    data: { merchantId: merchant.id, name: "OfficeMart Supplies", criticality: "low", paymentHistoryScore: 0.7 },
  });

  const today = new Date();
  const daysFromNow = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };

  // Payables — mix of criticalities and due dates to create a real shortfall
  await prisma.payable.createMany({
    data: [
      { merchantId: merchant.id, vendorId: criticalVendor.id, amount: 120000, dueDate: daysFromNow(4), status: "pending" },
      { merchantId: merchant.id, vendorId: mediumVendor.id, amount: 45000, dueDate: daysFromNow(5), status: "pending" },
      { merchantId: merchant.id, vendorId: lowVendor.id, amount: 18000, dueDate: daysFromNow(6), status: "pending" },
      { merchantId: merchant.id, vendorId: mediumVendor.id, amount: 30000, dueDate: daysFromNow(9), status: "pending" },
    ],
  });

  // Settlements — deliberately delayed relative to the payables above,
  // creating a genuine forecasted shortfall around day 5-6
  await prisma.settlement.createMany({
    data: [
      { merchantId: merchant.id, expectedDate: daysFromNow(8), amount: 90000, status: "expected" },
      { merchantId: merchant.id, expectedDate: daysFromNow(12), amount: 60000, status: "expected" },
    ],
  });

  console.log("Seed complete. Merchant ID:", merchant.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
