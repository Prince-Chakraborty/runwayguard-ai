# RunwayGuard

**An AI treasury agent that forecasts cash shortfalls and acts, within strict server-side limits, before they happen.**

Built for the Razorpay AI Buildathon 2026 — AI Finance Controller track.

**Live demo:** https://runwayguard-ai.vercel.app (password: `runway-demo-2026`)

**33/33 automated tests passing** | **Deterministic financial guardrails** | **Full audit trail**

Real engineering issues hit and fixed during development are documented as closed GitHub Issues, not hidden: [#1 production login bug](https://github.com/Prince-Chakraborty/runwayguard-ai/issues/1), [#2 Prisma 7 breaking change](https://github.com/Prince-Chakraborty/runwayguard-ai/issues/2), [#3 duplicate escalation bug caught by tests](https://github.com/Prince-Chakraborty/runwayguard-ai/issues/3).

---

## The Problem

Indian SME merchants rarely fail because of low sales. They fail because payables and receivables fall out of sync for a few bad days. This is usually predictable 3-14 days in advance, but no one watches it continuously enough to act in time.

## Why Existing Solutions Aren't Enough

- Accounting tools show historical state. They don't forecast forward or act.
- Razorpay's own Agent Studio ships strong reactive agents — dispute handling, failed-payment recovery, RTO analysis, reconciliation, invoice follow-up. Every one responds to an event that already happened. Nothing autonomously intervenes to protect runway before a shortfall lands.
- Nothing in the current landscape closes the loop from forecast to decision to safe autonomous action.

## The RunwayGuard Solution

RunwayGuard continuously forecasts a merchant's 14-day cash position from real payables, settlements, and account balance data. When it detects a coming shortfall, it plans a sequence of interventions, executes only what's safe under hard server-side limits, and asks a human before anything irreversible or high-risk. Every decision is logged with a plain-English reason.

**This is forward-looking and protective, not reactive.**

## Agent Workflow

```
Merchant data (payables, settlements, balance)
        |
        v
   FORECAST  --  deterministic 14-day cash projection
        |
        v
     PLAN    --  planner proposes interventions
        |
        v
    GUARD    --  deterministic policy engine evaluates every action
        |
        +----------------+
        v                v
  AUTO-EXECUTE       ESCALATE (human approval required)
        |                |
        v                v
   VERIFY   <-------------+
        |
        v
  AUDIT LOG  (immutable, every stage recorded)
```

The guardrail layer is the safety boundary. It re-validates every proposed action against merchant-configured policy regardless of what the planner proposed. No planner output ever executes a financial action directly.

## Architecture

See `docs/ARCHITECTURE.md` for the full diagram and component breakdown.

**Stack:** Next.js (App Router) + TypeScript, PostgreSQL + Prisma (driver adapters), Vitest, JWT auth with bcrypt. Modular monolith — no microservices; a hackathon-scale product doesn't need the coordination overhead.

**Planner abstraction:**

```
                  Planner Interface
                         |
            +------------+------------+
            v                         v
     HeuristicPlanner           ClaudePlanner
     (deterministic,            (Claude, forced
      zero API keys)             tool-use, schema-
            |                    validated output)
            |                         |
            +------------+------------+
                         v
                Same Plan Schema (Zod-validated)
                         v
                 Same Guardrail Engine
                         v
                 Same Execution Path
                         v
                  Same Audit Trail
```

Both planners are kept permanently, not as a fallback removed once AI is available. The heuristic planner proves the guardrail and execution pipeline works independent of any LLM, and keeps the product demoable with zero external dependencies.

## Guardrails

All financial-action safety logic lives server-side in `lib/policy/guardrail-engine.ts`, never inside a prompt, never trusted from LLM output.

| Policy field | Purpose |
|---|---|
| `autoActionLimit` | Rupee ceiling for autonomous execution |
| `maxDelayDays` | Cap on how long a hold can autonomously extend |
| `minForecastConfidence` | Below this, every action escalates regardless of amount |
| `criticalVendorProtection` | Critical vendor holds always escalate, regardless of amount |
| `humanApprovalAbove` | Hard rupee ceiling above which nothing auto-executes |

`early_settlement_request` actions always escalate, unconditionally — treated as irreversible-adjacent regardless of amount or confidence.

## Security

- JWT-based auth on every API route (`lib/auth.ts`)
- Every database query scoped to the token-verified merchant ID, never a client-supplied ID
- Proven with an automated test that merchant A cannot view or act on merchant B's data
- bcrypt-hashed credentials, no plaintext secrets committed
- Idempotency enforced at two independent layers: application logic and a database-level unique constraint on `idempotencyKey` (proven to reject duplicates with Postgres error `P2002`)
- Webhook signature verification (HMAC, timing-safe comparison), implemented and tested; activates in production the moment a real `RAZORPAY_WEBHOOK_SECRET` is configured

## AI Provider

**Swappable Claude/heuristic architecture.** If `ANTHROPIC_API_KEY` is set, `ClaudePlanner` is used (forced tool-use, Zod-schema-validated structured output); otherwise `HeuristicPlanner` runs, fully deterministic, no external API required.

**Claude activation requires an Anthropic API credential**, which was not available during this development window. The `ClaudePlanner` implementation is complete but has not been run end-to-end against a live API. Stated plainly rather than claimed as working.

## Payment Integration

**Deterministic Razorpay-shaped mock provider.** `PAYMENT_PROVIDER=mock|razorpay` is set server-side via environment variable only — no UI toggle exists.

The provider interface uses generic operation names — `createPaymentHoldRequest()`, `createReleaseRequest()`, `createEarlySettlementRequest()` — deliberately, because Razorpay does not currently document a "hold payout" endpoint. No unverified Razorpay capability is claimed anywhere in this codebase.

The mock provider emits Razorpay-shaped reference IDs (`mock_pout_...`) and writes real `WebhookEvent` rows through the same table the production webhook processor consumes.

**A real Razorpay test-mode adapter is implemented and verified.** `lib/payment-provider/razorpay-provider.ts` makes genuine, authenticated API calls to Razorpay's test-mode Orders API using real test credentials -- confirmed working end-to-end through the actual `PaymentProvider` interface the agent cycle uses, producing real Razorpay-issued order IDs (verifiable directly in the Razorpay dashboard). Scope, stated honestly: standard developer test-mode access covers the Orders/Payments API, not RazorpayX Payouts (which requires separate business current-account approval) -- and Razorpay does not currently document a "hold payout" endpoint at all. The adapter uses real Orders as a verifiable, inspectable artifact representing each treasury intervention, rather than claiming a payout-execution capability that doesn't exist in Razorpay's public API.

## Setup Instructions

Requires Node.js, PostgreSQL, and npm.

```bash
git clone https://github.com/Prince-Chakraborty/runwayguard-ai.git
cd runwayguard-ai
npm install
cp .env.example .env
npx prisma migrate dev --name init
npx tsx prisma/seed/seed.ts
npm run dev
```

`npm install` also runs `prisma generate` automatically via postinstall.

Generate a demo password hash:

```bash
node -e "console.log(require('bcryptjs').hashSync('your-password-here', 10))"
```

Paste the result into `.env` as `DEMO_MERCHANT_PASSWORD_HASH`. Escape every `$` with a backslash — Next.js performs variable expansion on `.env` files, and bcrypt hashes use `$` as a delimiter.

Visit `http://localhost:3000` and sign in with your chosen password.

## Running Tests

```bash
npm test
```

33 automated tests across 8 files covering: forecast engine, guardrail rules, idempotency at both application and database level, authorization and tenant isolation, approval workflow, webhook signature and duplicate handling, and agent plan schema validation.

## Demo Instructions

See `docs/DEMO_SCRIPT.md` for the full walkthrough. Short version: seed data creates a merchant with a genuine forecasted shortfall six days out. Click "Run Agent Cycle" on the Command Center — watch the loop strip light up, the runway chart update, three low/medium-risk payables auto-execute, and one critical-vendor payable escalate to the Approval Queue for a human decision.

## Limitations

Stated plainly, not hidden:

- **Claude integration is built but unrun** — no Anthropic API credential was available during development. Architecture supports it with a single env-var change.
- **Razorpay test-mode integration is real and verified**, but scoped to the Orders/Payments API available under standard developer access — not RazorpayX Payouts, which requires separate business account approval this project did not have.
- **Held payables are excluded from the forecast rather than rescheduled** to a new due date — a v1 simplification. Production would reschedule to `dueDate + delayDays` and re-forecast.
- **Single-tenant demo auth** (one password, one seeded merchant) — production would need per-merchant signup and credential management.
- No automated tests exist yet for the frontend UI layer — test coverage is backend/API-focused.
