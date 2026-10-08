import type { Metadata } from "next";
import { LeadsWorkbench } from "@/components/leads/leads-workbench";
import { listEvents } from "@/lib/db/queries/events";
import { distinctPersonas, getLeadDetail, listLeads, statusCounts, type LeadSort, type LeadStatus } from "@/lib/db/queries/leads";
import { isConfigured } from "@/lib/env";
import { isApproved } from "@/lib/services/review";

export const metadata: Metadata = { title: "Leads" };
export const dynamic = "force-dynamic";

const VIEWS: { key: string; label: string; statuses?: LeadStatus[] }[] = [
  { key: "review", label: "Needs review", statuses: ["needs_review"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "synced", label: "Synced", statuses: ["hubspot_synced"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected"] },
  { key: "low", label: "Below threshold", statuses: ["discovered", "qualified", "enriching"] },
  { key: "all", label: "All" },
];

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === one(sp.view)) ?? VIEWS[0];
  const eventId = one(sp.event) || undefined;
  const persona = one(sp.persona) || undefined;
  const industry = one(sp.industry) || undefined;
  const q = one(sp.q) || undefined;
  const minScore = Number(one(sp.minScore)) || undefined;
  const minPriority = Number(one(sp.minPriority)) || undefined;
  const minAttendance = Number(one(sp.minAttendance)) || undefined;
  const sort = (one(sp.sort) as LeadSort | undefined) ?? (view.key === "review" ? "priority" : "score");

  const peekId = one(sp.lead);
  const peekValid = peekId && /^[0-9a-f-]{36}$/i.test(peekId) ? peekId : undefined;

  const [{ items, total }, counts, events, personas, peekRow] = await Promise.all([
    listLeads({ eventId, statuses: view.statuses, persona, industry, q, minScore, minPriority, minAttendance, sort, limit: 200 }),
    statusCounts(),
    listEvents(),
    distinctPersonas(),
    peekValid ? getLeadDetail(peekValid) : Promise.resolve(null),
  ]);

  const countFor = (v: (typeof VIEWS)[number]) =>
    v.statuses ? v.statuses.reduce((a, s) => a + (counts[s] ?? 0), 0) : Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <LeadsWorkbench
      items={JSON.parse(JSON.stringify(items))}
      total={total}
      viewKey={view.key}
      views={VIEWS.map((v) => ({ key: v.key, label: v.label, count: countFor(v) }))}
      events={events.map((e) => ({ id: e.id, name: e.name }))}
      personas={personas}
      filters={{ q, eventId, persona, industry, minScore, minPriority, minAttendance, sort }}
      crmConfigured={isConfigured("HUBSPOT_ACCESS_TOKEN")}
      peekDetail={peekRow ? JSON.parse(JSON.stringify(peekRow)) : null}
      peekApproved={peekRow ? isApproved(peekRow) : false}
    />
  );
}
