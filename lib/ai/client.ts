import "server-only";
import OpenAI from "openai";
import { getEnv, requireEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { IntegrationError } from "@/lib/http";
import { limiter } from "@/lib/concurrency";

const log = createLogger("ai");

/**
 * Provider-specific request tweaks live here and nowhere else.
 * Swapping models/providers = change MODEL_BASE_URL / MODEL_NAME / NVIDIA_API_KEY.
 */
function providerExtras(baseUrl: string, fast: boolean): Record<string, unknown> {
  if (baseUrl.includes("nvidia.com") && fast) {
    // Nemotron: skip chain-of-thought for extraction/classification (lower latency).
    return { chat_template_kwargs: { enable_thinking: false } };
  }
  return {};
}

let client: OpenAI | undefined;

function getClient() {
  if (!client) {
    const env = getEnv();
    client = new OpenAI({
      apiKey: requireEnv("NVIDIA_API_KEY"),
      baseURL: env.MODEL_BASE_URL,
      timeout: 90_000,
      maxRetries: 0, // retries handled below so we control backoff and logging
    });
  }
  return client;
}

export type ChatRequest = {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Ask the provider for a JSON object response. */
  json?: boolean;
  /** Allow the model's extended reasoning (slower). Default false. */
  reasoning?: boolean;
};

export type ChatResult = { text: string; model: string; promptTokens?: number; completionTokens?: number };

const aiLimit = limiter("ai", 3);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One chat completion with bounded retry on 429/5xx/timeouts. */
export function chat(req: ChatRequest): Promise<ChatResult> {
  return aiLimit(async () => {
    const env = getEnv();
    const maxAttempts = 4;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await getClient().chat.completions.create({
          model: env.MODEL_NAME,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          max_tokens: req.maxTokens ?? 2_000,
          temperature: req.temperature ?? 0,
          ...(req.json ? { response_format: { type: "json_object" as const } } : {}),
          ...providerExtras(env.MODEL_BASE_URL, !req.reasoning),
        } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
        const text = res.choices[0]?.message?.content;
        if (!text) throw new IntegrationError("ai", "malformed", "Model returned empty content");
        return {
          text,
          model: res.model,
          promptTokens: res.usage?.prompt_tokens,
          completionTokens: res.usage?.completion_tokens,
        };
      } catch (e) {
        const err = toIntegrationError(e);
        if (!err.retryable || attempt >= maxAttempts - 1) {
          log.warn("chat failed", { kind: err.kind, status: err.status, attempt });
          throw err;
        }
        const backoff = Math.min(1_000 * 2 ** attempt, 10_000) + Math.random() * 400;
        log.warn("chat retry", { kind: err.kind, status: err.status, attempt, backoffMs: Math.round(backoff) });
        await sleep(backoff);
      }
    }
  });
}

function toIntegrationError(e: unknown): IntegrationError {
  if (e instanceof IntegrationError) return e;
  if (e instanceof OpenAI.APIError) {
    const status = e.status;
    if (status === 401 || status === 403) return new IntegrationError("ai", "auth", e.message, status);
    if (status === 429) return new IntegrationError("ai", "rate_limit", e.message, status);
    if (status && status >= 500) return new IntegrationError("ai", "server", e.message, status);
    if (status) return new IntegrationError("ai", "bad_request", e.message, status);
    return new IntegrationError("ai", "network", e.message);
  }
  if (e instanceof Error && /timed? ?out|abort/i.test(e.message)) {
    return new IntegrationError("ai", "timeout", e.message);
  }
  return new IntegrationError("ai", "network", e instanceof Error ? e.message : "unknown AI error");
}

/** Safe connectivity test used by /system. */
export async function aiHealthCheck() {
  const r = await chat({
    system: "Reply with the single word: pong",
    user: "ping",
    maxTokens: 20,
  });
  return { model: r.model, reply: r.text.trim().slice(0, 40) };
}
