import "server-only";
import { exaSearch } from "@/lib/integrations/exa/search";
import { sanitizeText } from "@/lib/text";
import { isLookalikeSource, isLowQualitySource, isOwnDomain, verifyNearCompany } from "../verify";
import type { SignalCandidate, SignalDiscoveryInput } from "../types";

const AGGREGATORS = ["prnewswire", "businesswire", "yahoo.com", "marketwatch", "globenewswire"];

/**
 * Cheap discovery (Level 0). Candidates are only *possible* signals: each adapter's `verify` must confirm the
 * claim in the retrieved text before anything is persisted. Look-alike domains (e.g. a consultancy named
 * "<Company> Consulting") are dropped here so they can never masquerade as the company.
 */
export async function searchSignalCandidates(
  input: SignalDiscoveryInput,
  query: string,
  opts: { type: SignalCandidate["type"]; relevance: number; urgency?: number; workflowHints?: SignalCandidate["workflowHints"] },
): Promise<SignalCandidate[]> {
  const { results } = await exaSearch({ query, numResults: 6, maxCharacters: 3500, startPublishedDate: new Date(Date.now() - 540 * 86_400_000).toISOString().slice(0, 10) });
  const out: SignalCandidate[] = [];
  for (const r of results) {
    const url = r.url ?? "";
    if (!url) continue;
    if (AGGREGATORS.some((a) => url.includes(a)) && results.length > 2) continue;
    if (isLookalikeSource(url, input.companyName, input.domain) || isLowQualitySource(url)) continue;
    const text = sanitizeText(r.text ?? "");
    if (text.length < 120) continue;
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
      metadata: { fullTextForVerification: text.slice(0, 3500), primarySource: isOwnDomain(url, input.domain) },
    });
  }
  return out.slice(0, 4);
}

export { verifyNearCompany };
