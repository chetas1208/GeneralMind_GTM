import "server-only";
import { untrustedBlock } from "@/lib/ai/untrusted";
import { extractStructuredData } from "@/lib/ai/provider";
import { acceptEvidenceIds, llmConfidenceSchema } from "./classify";
import type { LlmConfidenceClassification } from "./types";

/** Ask the model to classify evidence. The numeric score is computed afterwards, not here. */
export async function classifyEvidence(input: {
  person: string;
  title?: string | null;
  company?: string | null;
  event: string;
  attendanceType: string;
  evidence: { id: string; type: string; text: string }[];
}): Promise<LlmConfidenceClassification & { evidenceIds: string[] }> {
  const allowed = input.evidence.map((e) => e.id);
  const listed = input.evidence
    .slice(0, 8)
    .map((e) => `id=${e.id} type=${e.type} text=${e.text.slice(0, 400)}`)
    .join("\n");
  const raw = await extractStructuredData(
    llmConfidenceSchema,
    {
      system:
        "Classify evidence for a GTM claim. Do not invent a confidence percentage. Use only the evidence ids listed. If sources disagree, say so in contradictions. If a fact is not in the evidence, put it in missingEvidence.",
      user: untrustedBlock(
        "evidence records",
        `Person: ${input.person}\nTitle: ${input.title ?? "unknown"}\nCompany: ${input.company ?? "unknown"}\nEvent: ${input.event}\nAttendance relationship: ${input.attendanceType}\n\nEVIDENCE:\n${listed || "(none)"}`,
      ),
      maxTokens: 500,
      temperature: 0.1,
    },
    { label: "confidenceClassification" },
  );
  return { ...raw, evidenceIds: acceptEvidenceIds(raw.evidenceIds, allowed) };
}
