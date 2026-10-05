import "server-only";
import { exaSearch } from "@/lib/integrations/exa/search";
import { findSnippet, sanitizeText } from "@/lib/text";
import type { SignalCandidate, SignalDiscoveryInput } from "../types";

const AGGREGATORS = ["prnewswire", "businesswire", "yahoo.com", "marketwatch", "globenewswire"];

export async function searchSignalCandidates(
  input: SignalDiscoveryInput,
  query: string,
  opts: { type: SignalCandidate["type"]; relevance: number; urgency?: number; workflowHints?: SignalCandidate["workflowHints"] },
): Promise<SignalCandidate[]> {
  const { results } = await exaSearch({ query, numResults: 6, maxCharacters: 3500, startPublishedDate: "2024-01-01" });
  const out: SignalCandidate[] = [];
  for (const r of results) {
    const url = r.url ?? "";
    if (AGGREGATORS.some((a) => url.includes(a)) && results.length > 2) continue;
    const text = sanitizeText(r.text ?? "");
    if (text.length < 120) continue;
    if (!mentionsCompany(text, input.companyName)) continue;
    out.push({
      type: opts.type,
      direction: "positive",
      title: (r.title ?? query).slice(0, 200),
      summary: text.slice(0, 280),
      sourceUrl: url,
      sourceTitle: r.title,
      evidenceText: text.slice(0, 600),
      confidence: 72,
      relevance: opts.relevance,
      urgency: opts.urgency ?? 55,
      workflowHints: opts.workflowHints,
      occurredAt: r.publishedDate ? new Date(r.publishedDate) : null,
    });
  }
  return out.slice(0, 3);
}

export function mentionsCompany(text: string, companyName: string): boolean {
  const compact = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const t = text.toLowerCase();
  if (t.includes(companyName.toLowerCase())) return true;
  if (compact.length >= 4 && t.replace(/[^a-z0-9]/g, "").includes(compact)) return true;
  return false;
}

export function verifySnippet(candidate: SignalCandidate, needles: RegExp[]): boolean {
  const text = `${candidate.evidenceText ?? ""} ${candidate.summary}`;
  return needles.some((re) => re.test(text)) && text.length >= 80;
}

export function verifyWithQuote(candidate: SignalCandidate, phrase: string): boolean {
  const text = candidate.evidenceText ?? candidate.summary;
  return Boolean(findSnippet(text, phrase.slice(0, 80), 8));
}
