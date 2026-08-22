import Anthropic from "@anthropic-ai/sdk";
import { Planner, PlannerInput, Plan, PlanSchema } from "./types";

// Forced tool-use: Claude MUST respond via the propose_cash_flow_plan tool,
// so output is always structured JSON — never freeform text that could
// be misparsed or used to smuggle an unvalidated action into the system.
export class ClaudePlanner implements Planner {
  name = "claude-v1";
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async planInterventions(input: PlannerInput): Promise<Plan> {
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      tools: [
        {
          name: "propose_cash_flow_plan",
          description:
            "Propose a set of interventions to protect the merchant's cash runway given a forecasted shortfall. Do not invent payables that were not provided in context.",
          input_schema: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                description: "One-line, user-safe summary of the situation and plan. No internal reasoning detail.",
              },
              interventions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["hold_payable", "early_settlement_request"] },
                    targetPayableId: { type: "string" },
                    amount: { type: "number" },
                    delayDays: { type: "number" },
                    reason: { type: "string", description: "Concise, user-safe explanation for this specific action." },
                  },
                  required: ["type", "amount", "reason"],
                },
              },
            },
            required: ["summary", "interventions"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "propose_cash_flow_plan" },
      messages: [
        {
          role: "user",
          content: `Merchant: ${input.merchantName}
Shortfall predicted: ${input.shortfallDetected}
Shortfall date: ${input.shortfallDate ?? "N/A"}
Shortfall amount: ${input.shortfallAmount ?? "N/A"}

Upcoming payables (only propose actions against these — do not invent others):
${JSON.stringify(input.payables, null, 2)}

If no shortfall is predicted, return an empty interventions array. Prioritize holding lower-criticality, smaller payables before higher-criticality ones. Never propose holding a payable not listed above.`,
        },
      ],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("Claude did not return a structured plan via tool use.");
    }

    // Validate against the schema regardless of what the model returned —
    // an LLM output is never trusted as-is.
    const parsed = PlanSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      throw new Error(`Claude's plan failed schema validation: ${parsed.error.message}`);
    }

    return parsed.data;
  }
}
