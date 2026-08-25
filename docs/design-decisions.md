# Design Decisions

Why the system is built the way it is, including one real bug we hit and fixed during development.

## 1. Guardrails are deterministic code, never a prompt

The entire safety story of this product rests on one rule: an LLM's output is a *proposal*, never an *instruction*. `lib/policy/guardrail-engine.ts` is plain TypeScript with no AI dependency. It re-validates every proposed action against merchant policy regardless of which planner produced it. This means a prompt injection, a hallucinated action, or a misbehaving model literally cannot move money beyond configured limits — the guardrail function doesn't know or care what produced its input, only whether that input satisfies policy.

## 2. Two planners, kept permanently

`HeuristicPlanner` was originally going to be a stopgap until Claude access arrived. It became a permanent architectural decision instead. Reasoning: every automated test in this repository runs against the heuristic planner, with zero external API dependency. That means the guardrail, execution, and audit pipeline is provably correct independent of any LLM's behavior on a given day. If Claude's output is ever wrong or unavailable, the system doesn't degrade to "broken" — it degrades to "deterministic," which is the safer failure mode for a financial product.

## 3. Modular monolith, not microservices

The core loop (forecast, plan, guard, act, verify, audit) is a single logical transaction from the user's perspective. Splitting it into separate services would add network calls and partial-failure modes without any real scaling benefit at this stage — a single merchant's forecast cycle processes a handful of rows, not a distributed workload. The guardrail boundary needs to be simple and auditable above all else; a monolith with clear internal module boundaries (`lib/agent`, `lib/policy`, `lib/payment-provider`, `lib/forecast`) achieves that more reliably than a distributed system would.

## 4. Idempotency at two independent layers, not one

A single unique constraint would probably have been enough to pass a demo. Two layers exist because financial systems shouldn't rely on a single point of correctness: application logic excludes already-`held` payables from future planning cycles (so a second agent run naturally proposes nothing new for them), and a database-level unique constraint on `idempotencyKey` provides a second, independent guarantee that survives even if the application logic has a bug. This was validated directly: an automated test intentionally attempts a duplicate insert and confirms Postgres rejects it with error `P2002`.

## 5. Generic payment operation names, not Razorpay-specific ones

The `PaymentProvider` interface uses `createPaymentHoldRequest()`, not `holdPayout()`. This was a deliberate correction during development: Razorpay does not currently document a "hold payout" endpoint, and naming the interface method after an unverified capability would have made the codebase itself imply something untrue. The generic name is honest about what's actually being modeled — a payment-hold *request* — regardless of which underlying provider eventually fulfills it.

## 6. A real bug, and how it was found: base64-encoding the demo password hash

During deployment, login worked locally but failed in production with no indication why. Root cause, found by adding temporary diagnostic output to the login route rather than guessing: Vercel's environment variable system performs `$`-prefixed variable interpolation on stored values, and a bcrypt hash is full of `$` delimiters (`$2b$10$...`). Vercel was silently treating fragments of the hash as variable references, stripping them, and corrupting the stored value from 60 characters down to 43.

The fix was to store the hash base64-encoded (which contains no `$` characters at all) and decode it in code before comparison. This is documented here because it's a real, non-obvious platform interaction, not something either standard bcrypt or Next.js documentation calls out, and it's exactly the kind of debugging story worth being able to explain in an interview: identify the actual failure with evidence (a diagnostic response, not a guess), find the platform-specific root cause, and fix it in a way that's robust across platforms rather than patching around one symptom.

## 7. Structured output validated with Zod, regardless of source

Both `HeuristicPlanner` and `ClaudePlanner` must return a plan matching `PlanSchema` (`lib/agent/types.ts`). This is validated with `.safeParse()` before the plan is ever used — an LLM's output is never trusted as-is, including its shape, not just its content. If a future model version changes its output format or a network response gets corrupted, this fails loudly and safely rather than silently accepting malformed data into a financial pipeline.
