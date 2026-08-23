# Demo Script

Total runtime: under 2 minutes. Every step below has been run and verified against the actual codebase — nothing here is aspirational.

## Setup (before the demo starts)

```bash
npx prisma migrate reset --force
npx tsx prisma/seed/seed.ts
npm run dev
```

Open `http://localhost:3000`, sign in with the demo password. This gives a clean, known starting state: a merchant with four pending payables and two expected settlements, deliberately arranged so a real shortfall exists six days out.

## 0:00 - 0:20 -- The Problem, Fast

Open on the Command Center. Point at the runway forecast area (still empty, first load).

Say: "Most SME payment failures aren't caused by low sales. They're caused by payables and receivables falling out of sync for a few days -- and nobody catching it in time. RunwayGuard watches this continuously and acts before it becomes a crisis."

## 0:20 - 0:40 -- Trigger the Agent

Click "Run Agent Cycle."

Watch the loop strip light up left to right: FORECAST, PLAN, GUARD, ACT, VERIFY.

Say: "This isn't a single API call. It's forecasting fourteen days of cash position from real payables and settlements, then planning, then checking every proposed action against hard server-side limits, before anything executes."

The runway chart renders, showing the dip. Point at "Shortfall detected: YES."

## 0:40 - 1:00 -- Show the Safe Actions

Scroll to "Agent Actions -- Latest Run." Three actions show AUTO EXECUTED (OfficeMart 18k, QuickPack 45k, QuickPack 30k).

Say: "These three payables are low or medium priority, well under the merchant's auto-action limit -- the agent held them for three days on its own, no human needed, because policy allows it."

## 1:00 - 1:25 -- Show the Guardrail Actually Blocking Something

Point at the fourth action: Prime Fabric Suppliers, 1,20,000 rupees, PENDING APPROVAL.

Say: "This one is different. Same agent, same plan -- but this vendor is marked critical, and the merchant's policy says critical-vendor holds always need a human, regardless of amount. The AI doesn't get to override that. Watch."

Click into the Approvals tab. Show the pending item with its plain-English reason: "Vendor marked critical -- critical vendor protection policy blocks auto-hold."

## 1:25 - 1:45 -- Human Decides, System Verifies

Click Approve.

Say: "Now it executes -- but only because a human said yes."

Switch to the Payables tab -- show status now HELD. Switch to Audit Log -- show the new `approval_granted_action_executed` entry, timestamped, actor tagged `[human]`.

## 1:45 - 2:00 -- Close on the Numbers

Switch to the Metrics tab.

Say: "Every number here is computed from what actually happened in this run -- nothing fabricated. Three actions auto-executed, one escalated and approved, about ninety-three thousand rupees of runway protected in one cycle -- and a complete, immutable audit trail behind every decision."

## The One Exception Case Worth Mentioning If Asked

If a judge asks "what if the merchant says no": click Reject on a pending approval instead of Approve during a live Q&A -- the payable stays untouched, the action is marked rejected, and it's logged exactly the same way. This is already built and tested (`tests/approval-workflow.test.ts`), not improvised.

## What NOT to Claim During This Demo

- Do not say "Claude decided this" -- the planner currently running is `HeuristicPlanner` unless `ANTHROPIC_API_KEY` is configured. If asked, say plainly: "This run used our deterministic planner. The architecture supports Claude with a one-line environment change -- we just didn't have API access during this build window."
- Do not say "this is live Razorpay" -- say "this is a Razorpay-shaped simulation; the adapter architecture supports swapping in the real sandbox without touching any agent or guardrail code."
