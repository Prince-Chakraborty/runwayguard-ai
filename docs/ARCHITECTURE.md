# Architecture

## System Overview

```
                              Merchant
                                 |
                                 v
                     RunwayGuard Dashboard (Next.js)
                                 |
                    JWT-authenticated API routes
                                 |
                                 v
                       Agent Orchestrator
                    (lib/agent/run-agent-cycle.ts)
                                 |
              +------------------+------------------+
              v                                      v
      Forecast Engine                        Planner Interface
   (deterministic, pure math)          +---------------+---------------+
              |                        v                               v
              v                 HeuristicPlanner                ClaudePlanner
      Cash Position Snapshots   (deterministic,                 (Claude API,
      (14-day time series)       zero API keys)                  forced tool-use)
              |                        |                               |
              +------------------------+-------------------------------+
                                        v
                              Same Plan Schema (Zod-validated)
                                        |
                                        v
                              Guardrail Engine
                        (lib/policy/guardrail-engine.ts)
                          deterministic, server-side only
                                        |
                          +-------------+-------------+
                          v                           v
                   AUTO-EXECUTE                  ESCALATE
                          |                           |
                          v                           v
                 Payment Provider              Approval Queue
                 Interface                     (human decision)
                          |                           |
              +-----------+-----------+                |
              v                       v                |
       MockPaymentProvider    RazorpayProvider*         |
       (deterministic,        (not built --             |
        Razorpay-shaped       no credentials             |
        reference IDs)        available)                 |
              |                                          |
              +--------------------+---------------------+
                                    v
                              Verification
                          (payable status update,
                           WebhookEvent emitted)
                                    |
                                    v
                            Ledger / State
                          (Prisma / PostgreSQL)
                                    |
                                    v
                              Audit Ledger
                          (immutable AuditLog rows)
```

`*` The Razorpay adapter is architecturally supported behind the `PaymentProvider` interface but was not built during development — no sandbox credentials were available. Swapping it in requires implementing one class against the existing interface; zero changes to agent, guardrail, or orchestration code.

## Component Responsibilities

| Component | File(s) | Responsibility |
|---|---|---|
| Dashboard | `app/page.tsx` | Auth, tab navigation, calls API routes, renders forecast/actions/approvals/metrics |
| API routes | `app/api/*/route.ts` | JWT verification, merchant-scoped queries, request validation |
| Auth | `lib/auth.ts` | JWT sign/verify, never trusts client-supplied merchant ID |
| Agent orchestrator | `lib/agent/run-agent-cycle.ts` | Runs the full FORECAST-PLAN-GUARD-ACT-VERIFY-AUDIT cycle |
| Forecast engine | `lib/forecast/forecast-engine.ts` | Deterministic 14-day cash projection, pure function, no AI |
| Planner interface | `lib/agent/types.ts` | Shared contract between HeuristicPlanner and ClaudePlanner |
| Heuristic planner | `lib/agent/heuristic-planner.ts` | Rule-based intervention proposals, zero external dependencies |
| Claude planner | `lib/agent/claude-planner.ts` | Forced tool-use Claude integration, schema-validated output |
| Guardrail engine | `lib/policy/guardrail-engine.ts` | The single source of truth for auto-execute vs. escalate |
| Payment provider | `lib/payment-provider/*` | Adapter interface; mock implementation is the only one built |
| Metrics | `lib/metrics/metrics.ts` | Pure aggregation queries over real historical data |
| Webhook processor | `app/api/webhooks/route.ts` | Signature verification, idempotent event processing |

## Data Model

Eleven Prisma models, each merchant-scoped for tenant isolation:

- **Merchant** — root entity, has one Policy
- **Policy** — per-merchant configurable guardrail thresholds
- **Vendor** — criticality classification feeds guardrail risk scoring
- **Payable** — the financial obligations being forecasted and protected
- **Settlement** — expected inbound cash, feeds the forecast
- **CashPositionSnapshot** — time-series points that build the runway chart (not just a final JSON blob)
- **AgentRun** — one row per forecast cycle
- **AgentAction** — one row per proposed intervention, carries the unique `idempotencyKey`
- **Approval** — human decision record, linked 1:1 to an escalated AgentAction
- **AuditLog** — append-only, every stage of every cycle
- **WebhookEvent** — idempotent event log, unique on `providerEventId`

## Why a Modular Monolith, Not Microservices

The core loop (forecast, plan, guard, act, verify, audit) is a single coherent transaction from the user's perspective, and splitting it into separate services would introduce network calls and partial-failure modes for no reliability or scaling benefit at this stage. A hackathon-scale product with one merchant flow does not need the coordination overhead of distributed services; it needs the guardrail boundary to be simple, auditable, and provably correct, which a monolith with clear internal module boundaries achieves more reliably than a distributed system would.

## Why Two Planners, Permanently

`HeuristicPlanner` is not scaffolding to be deleted once `ClaudePlanner` works. It is the reason the guardrail and execution pipeline can be proven correct independent of any LLM's behavior — every automated test in this repository runs against the heuristic planner, and passes without any external API dependency. Keeping both, behind one interface, is what makes the safety claims in this README testable rather than aspirational.
