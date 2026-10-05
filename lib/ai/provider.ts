import "server-only";
import type { z } from "zod";
import { createLogger } from "@/lib/logger";
import { chat, type ChatRequest } from "./client";

const log = createLogger("ai");

export class AiValidationError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = "AiValidationError";
  }
}

/** Tolerant JSON extraction: strips code fences and finds the outermost object/array. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.search(/[{[]/);
    if (start === -1) throw new Error("No JSON found in model output");
    const open = candidate[start];
    const close = open === "{" ? "}" : "]";
    const end = candidate.lastIndexOf(close);
    if (end <= start) throw new Error("Unterminated JSON in model output");
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

function describeIssues(error: z.ZodError) {
  return error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/**
 * Generic structured-output primitive.
 * Validate with Zod → on failure retry ONCE with a repair instruction →
 * if still invalid throw `AiValidationError` (caller records failure and continues).
 */
export async function extractStructuredData<T>(
  schema: z.ZodType<T>,
  req: Omit<ChatRequest, "json">,
  opts: { label: string } = { label: "structured" },
): Promise<T> {
  const first = await chat({ ...req, json: true });
  const attempt1 = tryParse(schema, first.text);
  if (attempt1.ok) return attempt1.value;

  log.warn("validation failed, repairing", { label: opts.label, issues: attempt1.message.slice(0, 300) });
  const repaired = await chat({
    ...req,
    json: true,
    user: `${req.user}

---
Your previous answer was invalid.
Problems: ${attempt1.message}
Previous answer:
${first.text.slice(0, 4_000)}

Return ONLY a corrected JSON object that satisfies the required schema. Do not add explanations.`,
  });
  const attempt2 = tryParse(schema, repaired.text);
  if (attempt2.ok) return attempt2.value;

  log.error("validation failed after repair", { label: opts.label, issues: attempt2.message.slice(0, 300) });
  throw new AiValidationError(`${opts.label}: ${attempt2.message}`, repaired.text);
}

function tryParse<T>(schema: z.ZodType<T>, text: string): { ok: true; value: T } | { ok: false; message: string } {
  let json: unknown;
  try {
    json = extractJson(text);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "invalid JSON" };
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, message: describeIssues(parsed.error) };
}
