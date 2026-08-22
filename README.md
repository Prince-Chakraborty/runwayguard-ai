# RunwayGuard

**An AI treasury agent that forecasts cash shortfalls and acts, within strict server-side limits, before they happen.**

Built for the Razorpay AI Buildathon 2026 — AI Finance Controller track.

---

## The Problem

Indian SME merchants rarely fail because of low sales. They fail because payables and receivables fall out of sync for a few bad days. This is usually predictable 3-14 days in advance, but no one watches it continuously enough to act in time.

## Why Existing Solutions Aren't Enough

- Accounting tools show historical state. They don't forecast forward or act.
- Razorpay's own Agent Studio ships strong reactive agents - dispute handling, failed-payment recovery, RTO analysis, reconciliation, invoice follow-up. Every one responds to an event that already happened. Nothing autonomously intervenes to protect runway before a shortfall lands.

## The RunwayGuard Solution

RunwayGuard continuously forecasts a merchant's 14-day cash position from real payables, settlements, and account balance data. When it detects a coming shortfall, it plans a sequence of interventions, executes only what's safe under hard server-side limits, and asks a human before anything irreversible or high-risk.

This is forward-looking and protective, not reactive.

## Agent Workflow
Merchant data (payables, settlements, balance)
|
v
FORECAST -- deterministic 14-day cash projection
|
v
PLAN -- planner proposes interventions
|
v
GUARD -- deterministic policy engine evaluates every action
|
+--------------+
v v
AUTO-EXECUTE ESCALATE (human approval required)
| |
v v
VERIFY <------------+
|
v
AUDIT LOG

The guardrail layer is the safety boundary. It re-validates every proposed action regardless of what the planner proposed. No planner output ever executes a financial action directly.

## Architecture

See docs/ARCHITECTURE.md for the full diagram.

Stack: Next.js (App Router) + TypeScript, PostgreSQL + Prisma, Vitest, JWT auth with bcrypt. Modular monolith - no microservices.

Planner abstraction:
            Planner Interface
                   |
        +----------+----------+
        v                     v
 HeuristicPlanner       ClaudePlanner
 (deterministic,        (Claude, forced
  zero API keys)         tool-use)
        |                     |
        +----------+----------+
                   v
            Same Plan Schema (Zod-validated)
                   v
            Same Guardrail Engine
                   v
            Same Execution Path
                   v
            Same Audit Trail

Both planners are kept permanently. The heuristic planner proves the guardrail and execution pipeline works independent of any LLM.

## Guardrails

All financial-action safety logic lives server-side in lib/policy/guardrail-engine.ts, never inside a prompt.

| Policy field | Purpose |
|---|---|
| autoActionLimit | Rupee ceiling for autonomous execution |
| maxDelayDays | Cap on how long a hold can autonomously extend |
| minForecastConfidence | Below this, every action escalates |
| criticalVendorProtection | Critical vendor holds always escalate |
| humanApprovalAbove | Hard ceiling above which nothing auto-executes |

early_settlement_request actions always escalate, unconditionally.

## Security

- JWT-based auth on every API route
- Every database query scoped to the token-verified merchant ID, never a client-supplied ID
- Proven with a test that merchant A cannot view or act on merchant B's data
- bcrypt-hashed credentials, no plaintext secrets committed
- Idempotency enforced at two layers: application logic and a database-level unique constraint on idempotencyKey
- Webhook signature verification (HMAC, timing-safe comparison), implemented and tested

## AI Provider

Swappable Claude/heuristic architecture. If ANTHROPIC_API_KEY is set, ClaudePlanner is used (forced tool-use, schema-validated output); otherwise HeuristicPlanner runs, fully deterministic, no external API required.

Claude activation requires an Anthropic API credential, which was not available during this development window. The ClaudePlanner implementation is complete but has not been run end-to-end against a live API. Stated plainly rather than claimed as working.

## Payment Integration

Deterministic Razorpay-shaped mock provider. PAYMENT_PROVIDER=mock or razorpay is set server-side via environment variable only - no UI toggle exists.

The provider interface uses generic operation names - createPaymentHoldRequest, createReleaseRequest, createEarlySettlementRequest - deliberately, because Razorpay does not currently document a hold-payout endpoint. No unverified Razorpay capability is claimed anywhere in this codebase.

The mock provider emits Razorpay-shaped reference IDs and writes real WebhookEvent rows through the same table the production webhook processor consumes.

A Razorpay sandbox adapter is architecturally supported but live credentials were not available during development, so it has not been built or tested.

## Setup Instructions

Requires Node.js, PostgreSQL, and npm.

```bash
git clone your-repo-url-here
cd runwayguard-ai
npm install
cp .env.example .env
npx prisma migrate dev --name init
npx tsx prisma/seed/seed.ts
npm run dev
```

npm install also runs prisma generate automatically via postinstall.

Generate a demo password hash:

```bash
node -e "console.log(require('bcryptjs').hashSync('your-password-here', 10))"
```

Paste the result into .env as DEMO_MERCHANT_PASSWORD_HASH. Escape every dollar sign with a backslash, since Next.js performs variable expansion on .env files and bcrypt hashes use dollar signs as delimiters.

Visit http://localhost:3000 and sign in with your chosen password.

## Running Tests

```bash
npm test
```

33 automated tests across 8 files covering: forecast engine, guardrail rules, idempotency at both application and database level, authorization and tenant isolation, approval workflow, webhook signature and duplicate handling, and agent plan schema validation.

## Demo Instructions

See docs/DEMO_SCRIPT.md for the full walkthrough. Short version: seed data creates a merchant with a genuine forecasted shortfall six days out. Click "Run Agent Cycle" on the Command Center - watch the loop strip light up, the runway chart update, three low or medium-risk payables auto-execute, and one critical-vendor payable escalate to the Approval Queue for a human decision.

## Limitations

Stated plainly, not hidden:

- Claude integration is built but unrun - no Anthropic API credential was available during development. Architecture supports it with a single env-var change.
- Razorpay sandbox integration is not built - no live credentials were available. The adapter interface supports it without touching agent or guardrail logic.
- Held payables are excluded from the forecast rather than rescheduled to a new due date - a v1 simplification. Production would reschedule and re-forecast.
- Single-tenant demo auth (one password, one seeded merchant) - production would need per-merchant signup and credential management.
- No automated tests exist yet for the frontend UI layer - test coverage is backend and API focused.
