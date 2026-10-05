import "server-only";
import { updateEvent } from "@/lib/db/queries/events";
import { EVENT_RELEVANCE_THRESHOLD } from "@/lib/icp/config";

export type EventCandidate = {
  id: string;
  name: string;
  relevanceScore: number | null;
  startDate: string | null;
  industryTags: string[];
  agendaThemes: string[];
  status: string;
};

const THEME_BUCKETS = [
  { key: "procurement", re: /procure|purchasing|sourcing|p2p/i },
  { key: "supply_chain", re: /supply chain|logistic|warehouse/i },
  { key: "manufacturing", re: /manufactur|industrial|plant/i },
  { key: "erp", re: /\bsap\b|erp|enterprise application/i },
  { key: "finance_ops", re: /accounts payable|finance operations|shared services/i },
  { key: "order", re: /order management|order-to-cash|o2c/i },
] as const;

function themeOf(e: EventCandidate): string {
  const corpus = `${e.name} ${e.industryTags.join(" ")} ${e.agendaThemes.join(" ")}`;
  return THEME_BUCKETS.find((b) => b.re.test(corpus))?.key ?? "general";
}

/**
 * Promote verified upcoming events to Radar with diversity — quality over first-10-results.
 */
export async function selectTopEvents(candidates: EventCandidate[], limit = 10): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const already = candidates.filter((e) => e.status === "selected").length;
  const room = Math.max(0, limit - already);
  if (room === 0) return 0;

  const pool = candidates
    .filter(
      (e) =>
        e.status === "discovered" &&
        e.startDate &&
        e.startDate >= today &&
        (e.relevanceScore ?? 0) >= EVENT_RELEVANCE_THRESHOLD,
    )
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0) || (a.startDate ?? "").localeCompare(b.startDate ?? ""));

  const picked: EventCandidate[] = [];
  const usedThemes = new Set<string>();

  for (const e of pool) {
    if (picked.length >= room) break;
    const theme = themeOf(e);
    const themeCount = [...usedThemes].filter((t) => t === theme).length;
    if (picked.length >= 3 && themeCount >= 2 && (e.relevanceScore ?? 0) < 80) continue;
    picked.push(e);
    usedThemes.add(theme);
  }

  for (const e of picked) await updateEvent(e.id, { status: "selected" });
  return picked.length;
}
