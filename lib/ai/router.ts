import "server-only";
import { getEnv } from "@/lib/env";
import { chat, type ChatRequest, type ChatResult } from "./client";

export type TaskRole =
  | "PLANNER"
  | "SYNTHESIZER"
  | "DIFFICULT_CONTRADICTION"
  | "HIGH_VOLUME_CLASSIFICATION";

export type ModelRouteConfig = {
  role: TaskRole;
  model: string;
  reasoning: boolean;
};

/**
 * Routes AI tasks to appropriate model tiers:
 * - PLANNER, SYNTHESIZER, DIFFICULT_CONTRADICTION -> Frontier reasoning model (Nemotron Ultra)
 * - HIGH_VOLUME_CLASSIFICATION -> Fast agentic model (Nemotron Super / Fast, or Ultra fallback)
 */
export function getRouteForRole(role: TaskRole): ModelRouteConfig {
  const env = getEnv();
  const reasoningModel = process.env.MODEL_REASONING || env.MODEL_NAME || "nvidia/nemotron-3-ultra-550b-a55b";
  const fastModel = process.env.MODEL_FAST || reasoningModel;

  switch (role) {
    case "PLANNER":
      return { role, model: reasoningModel, reasoning: true };
    case "SYNTHESIZER":
      return { role, model: reasoningModel, reasoning: true };
    case "DIFFICULT_CONTRADICTION":
      return { role, model: reasoningModel, reasoning: true };
    case "HIGH_VOLUME_CLASSIFICATION":
      return { role, model: fastModel, reasoning: false };
  }
}

export async function chatWithRole(role: TaskRole, req: ChatRequest): Promise<ChatResult> {
  const route = getRouteForRole(role);
  return chat({
    ...req,
    reasoning: route.reasoning,
  });
}
