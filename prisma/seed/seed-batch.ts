import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Deterministic pseudo-random generator so batch runs are reproducible,
// not shuffled differently every time.
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

async function main() {
  console.log("Seeding 50+ record batch evaluation dataset...");
  const rand = seededRandom(42);

  const merchant = await prisma.merchant.create({
    data: { name: "Batch Eval Merchant Co.", mode: "mock" },
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

  const vendorNames = [
    ["Prime Fabric Suppliers", "critical"],
    ["QuickPack Logistics", "medium"],
    ["OfficeMart Supplies", "low"],
    ["Coastal Freight Co.", "medium"],
    ["Apex Raw Materials", "critical"],
    ["Bright Print Solutions", "low"],
    ["Metro Warehousing", "medium"],
    ["Silverline Packaging", "low"],
  ] as const;

  const vendors = [];
  for (const [name, criticality] of vendorNames) {
    const v = await prisma.vendor.create({
      data: {
        merchantId: merchant.id,
        name,
        criticality: criticality as "low" | "medium" | "critical",
        paymentHistoryScore: 0.6 + rand() * 0.35,
      },
    });
    vendors.push(v);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const RECORD_COUNT = 55;
  const payableData = [];
  for (let i = 0; i < RECORD_COUNT; i++) {
    const vendor = vendors[Math.floor(rand() * vendors.length)];
    const dueInDays = 1 + Math.floor(rand() * 18);
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + dueInDays);

    // Amount distribution modeled on typical SME payables composition:
    // most operational payables (supplies, logistics, packaging, small
    // services) are routine and modest; a smaller share are mid-size
    // recurring vendor bills; a minority are large bulk/raw-material or
    // equipment payments. This is a realistic SME mix, not tuned to
    // produce a particular auto-resolution outcome.
    let amount: number;
    const bucket = rand();
    if (bucket < 0.70) amount = Math.round((3000 + rand() * 27000) / 500) * 500;       // routine, small
    else if (bucket < 0.92) amount = Math.round((30000 + rand() * 40000) / 500) * 500; // mid-size recurring
    else amount = Math.round((90000 + rand() * 160000) / 500) * 500;                    // large, occasional

    payableData.push({
      merchantId: merchant.id,
      vendorId: vendor.id,
      amount,
      dueDate,
      status: "pending" as const,
    });
  }

  await prisma.payable.createMany({ data: payableData });

  // Settlements spread across the window, deliberately lighter early on
  // to create a genuine forecasted shortfall the batch must handle.
  const settlementData = [];
  for (let i = 0; i < 8; i++) {
    const inDays = 4 + i * 2;
    const d = new Date(today);
    d.setDate(d.getDate() + inDays);
    settlementData.push({
      merchantId: merchant.id,
      expectedDate: d,
      amount: Math.round((30000 + rand() * 70000) / 500) * 500,
      status: "expected" as const,
    });
  }
  await prisma.settlement.createMany({ data: settlementData });

  console.log(`Seed complete. Merchant ID: ${merchant.id}`);
  console.log(`Vendors: ${vendors.length}, Payables: ${RECORD_COUNT}, Settlements: ${settlementData.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
