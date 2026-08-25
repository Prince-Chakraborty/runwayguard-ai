# Batch Evaluation

## Evaluation Objective

Demonstrate RunwayGuard's agent cycle operating across a realistic multi-record batch, reporting throughput, auto-resolution rate, and unresolved exceptions -- with every number computed from actual execution, not estimated or asserted.

This evaluation is reproducible. It is not a one-time screenshot; anyone can run the two commands below against a fresh database and get the same class of result (exact figures will vary slightly run to run because vendor/amount assignment uses a seeded but position-dependent random walk -- see Known Limitations).

## Dataset Composition

- **55 payable records** (exceeds the 50-record threshold)
- **8 vendors** across three criticality tiers: 2 critical, 3 medium, 3 low
- **8 settlements** spread across the 14-day forecast window, deliberately front-loaded lighter than the payables to create a genuine forecasted shortfall the batch must respond to (not an artificially easy "everything auto-resolves" scenario)
- **1 merchant**, standard policy configuration (see below)

### Amount Distribution

Modeled on a realistic SME payables mix, not tuned to produce a particular outcome:

| Tier | Range | Share of records | Represents |
|---|---|---|---|
| Routine, small | Rs 3,000 - Rs 30,000 | 70% | Day-to-day operational payables -- supplies, small services, packaging |
| Mid-size recurring | Rs 30,000 - Rs 70,000 | 22% | Regular vendor bills, logistics, larger supply runs |
| Large, occasional | Rs 90,000 - Rs 250,000 | 8% | Bulk raw materials, equipment, large one-off vendor payments |

## Policy Configuration Used

| Field | Value |
|---|---|
| `autoActionLimit` | Rs 50,000 |
| `maxDelayDays` | 3 |
| `minForecastConfidence` | 0.85 |
| `criticalVendorProtection` | ON |
| `humanApprovalAbove` | Rs 50,000 |

## Results (Actual, Measured Run)

```
Total records:              55
Shortfall detected:         true
Records with no action needed:  0
Records with a proposed action: 55
  Auto-resolved:                33
  Exceptions (escalated):       22
Auto-resolution rate:       60.0%
Processing time:            242ms
Throughput:                 227.3 records/sec
```

### Exception Breakdown (22 total)

Every exception has a specific, machine-generated reason -- these are not a generic "flagged for review," each states exactly which policy rule blocked autonomous execution:

- **9 exceptions**: amount exceeded the Rs 50,000 human-approval threshold
- **13 exceptions**: vendor marked critical, and critical-vendor protection policy blocks any autonomous hold against that vendor regardless of amount (the smallest of these was just Rs 7,500 -- proving the rule is about vendor risk, not transaction size)

### Auto-Resolved Sample

Representative of the 33 auto-resolved records -- all under the auto-action limit, non-critical vendor, sufficient forecast confidence:

```
Rs 4,000  -- within auto-action limit, delay limit, and confidence threshold
Rs 4,500  -- within auto-action limit, delay limit, and confidence threshold
Rs 6,000  -- within auto-action limit, delay limit, and confidence threshold
Rs 7,500  -- within auto-action limit, delay limit, and confidence threshold
Rs 13,500 -- within auto-action limit, delay limit, and confidence threshold
```

## How to Reproduce

```bash
npx prisma migrate reset --force
npx tsx prisma/seed/seed-batch.ts
npx tsx scripts/batch-evaluation.ts
```

The seed script (`prisma/seed/seed-batch.ts`) and evaluation script (`scripts/batch-evaluation.ts`) are both in this repository -- this result can be independently verified by running the code, not just by trusting a pasted output.

## Interpretation

A 60% auto-resolution rate on a realistic SME payables mix means the agent safely handled the majority of routine cash-flow protection actions without human involvement, while correctly refusing to autonomously execute the minority of cases that carry real financial or relationship risk.

**The 22 exceptions are not failures.** They are the safety boundary working exactly as designed. RunwayGuard deliberately refuses to autonomously execute a transaction that exceeds a policy threshold or touches a critical vendor relationship -- no matter how confident the forecast or how reasonable the proposed action looks. That refusal is the product, not a limitation of it.

## Known Limitations of This Evaluation

- **Single merchant, single policy configuration.** A production evaluation would run this across multiple merchants with different policy settings to confirm the guardrail behaves correctly under varied configurations, not just one.
- **Synthetic data, not live merchant data.** Amounts and vendor criticality are generated from a seeded pseudo-random distribution designed to be realistic, not sourced from an actual merchant's transaction history.
- **No cross-run variance analysis.** This report reflects one run's output. Because vendor and amount assignment depends on iteration order through a seeded random walk, re-running after any change to the dataset generation logic will shift individual records between buckets, though the overall distribution shape stays consistent. A rigorous evaluation would run the batch multiple times with different seeds and report a range, not a single point figure.
- **"Auto-resolution rate" is our own metric name, not a term borrowed from an external rubric we've independently verified the exact definition of.** It is defined precisely above (auto-resolved actions divided by total proposed actions) so it can be checked directly against the code rather than assumed.
