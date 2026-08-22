import { Planner } from "./types";
import { HeuristicPlanner } from "./heuristic-planner";
import { ClaudePlanner } from "./claude-planner";

function buildPlanner(): Planner {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && apiKey.trim().length > 0) {
    return new ClaudePlanner(apiKey);
  }
  // No key configured — falls back to the deterministic planner.
  // The rest of the pipeline (guardrails, execution, audit) is identical
  // either way, so this is a transparent swap, not a degraded demo.
  return new HeuristicPlanner();
}

export const planner: Planner = buildPlanner();
