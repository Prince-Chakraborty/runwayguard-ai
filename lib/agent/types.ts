import { z } from "zod";

export const InterventionSchema = z.object({
  type: z.enum(["hold_payable", "early_settlement_request"]),
  targetPayableId: z.string().optional(),
  amount: z.number(),
  delayDays: z.number().optional(),
  reason: z.string(), // concise, user-safe explanation — never raw chain-of-thought
});

export const PlanSchema = z.object({
  summary: z.string(), // one-line, user-safe summary of the situation
  interventions: z.array(InterventionSchema),
});

export type Intervention = z.infer<typeof InterventionSchema>;
export type Plan = z.infer<typeof PlanSchema>;

export interface Planner {
  name: string;
  planInterventions(input: PlannerInput): Promise<Plan>;
}

export type PlannerInput = {
  merchantName: string;
  shortfallDetected: boolean;
  shortfallDate: string | null;
  shortfallAmount: number | null;
  payables: {
    id: string;
    vendorName: string;
    vendorCriticality: string;
    amount: number;
    dueDate: string;
  }[];
};
