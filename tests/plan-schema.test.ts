import { describe, it, expect } from "vitest";
import { PlanSchema } from "@/lib/agent/types";
import { HeuristicPlanner } from "@/lib/agent/heuristic-planner";

describe("agent plan schema", () => {
  it("accepts a well-formed plan", () => {
    const result = PlanSchema.safeParse({
      summary: "Test summary",
      interventions: [{ type: "hold_payable", amount: 5000, reason: "test reason" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a plan missing required fields", () => {
    const result = PlanSchema.safeParse({ interventions: [] }); // missing summary
    expect(result.success).toBe(false);
  });

  it("rejects an intervention with an invalid type", () => {
    const result = PlanSchema.safeParse({
      summary: "test",
      interventions: [{ type: "delete_all_payables", amount: 1, reason: "malicious" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an intervention missing amount or reason", () => {
    const result = PlanSchema.safeParse({
      summary: "test",
      interventions: [{ type: "hold_payable" }],
    });
    expect(result.success).toBe(false);
  });

  it("HeuristicPlanner output always validates against PlanSchema", async () => {
    const planner = new HeuristicPlanner();
    const plan = await planner.planInterventions({
      merchantName: "Test Co",
      shortfallDetected: true,
      shortfallDate: "2026-08-26",
      shortfallAmount: -3000,
      payables: [
        { id: "p1", vendorName: "V1", vendorCriticality: "low", amount: 5000, dueDate: "2026-08-24" },
      ],
    });
    const result = PlanSchema.safeParse(plan);
    expect(result.success).toBe(true);
  });

  it("HeuristicPlanner returns empty interventions when no shortfall detected", async () => {
    const planner = new HeuristicPlanner();
    const plan = await planner.planInterventions({
      merchantName: "Test Co",
      shortfallDetected: false,
      shortfallDate: null,
      shortfallAmount: null,
      payables: [],
    });
    expect(plan.interventions).toHaveLength(0);
  });
});
