import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { eventCompanies, eventLeads, people } from "@/lib/db/schema";
import { workflowLabel } from "@/lib/icp/workflows";
import { formatDateRange, formatLocation } from "@/lib/format";
import { signalTypeLabel } from "@/lib/gtm-present";
import type { GraphQueryParams, GraphViewModel } from "./types";
import { pruneGraph } from "./prune";
import { GraphAccumulator, edgeId, nodeId, workflowNodeId } from "./transforms";
import { listEvents } from "@/lib/db/queries/events";
import {
  associationEdgeType,
  associationVerification,
  attendanceEdgeType,
  attendanceVerification,
  evidenceSourceIsVerified,
} from "./provenance";
import {
  fetchCompanyRow,
  fetchCompanySignals,
  fetchEventCompanies,
  fetchEventRow,
  fetchEvidenceForLeads,
  fetchMarketSlice,
  fetchSignalClusters,
  getLeadDetail,
  listEventLeadRows,
} from "./queries";
import { applyGraphFilters } from "./filters";

const MAX_EVIDENCE = 8;
const MAX_SIGNALS = 6;
const MAX_EVENT_COMPANIES = 20;
const MAX_EVENT_LEADS = 25;

function finalize(acc: GraphAccumulator, scope: GraphQueryParams["scope"], rootId?: string): GraphViewModel {
  const { nodes, edges } = acc.snapshot();
  return {
    scope,
    rootId,
    nodes,
    edges,
    generatedAt: new Date().toISOString(),
    stats: { nodeCount: nodes.length, edgeCount: edges.length },
  };
}

function addEventNode(acc: GraphAccumulator, event: Awaited<ReturnType<typeof fetchEventRow>> & object, leadCount?: number) {
  if (!event) return;
  const id = nodeId("event", event.id);
  acc.addNode({
    id,
    type: "event",
    entityId: event.id,
    label: event.name,
    subtitle: [formatDateRange(event.startDate, event.endDate), formatLocation(event)].filter(Boolean).join(" · "),
    score: event.relevanceScore ?? undefined,
    href: `/events/${event.id}`,
    metadata: { leadCount },
  });
}

function addCompanyNode(acc: GraphAccumulator, company: NonNullable<Awaited<ReturnType<typeof fetchCompanyRow>>>) {
  const id = nodeId("company", company.id);
  acc.addNode({
    id,
    type: "company",
    entityId: company.id,
    label: company.name,
    subtitle: company.industry ?? undefined,
    score: company.companyFitScore ?? undefined,
    confidence: company.accountPriority ?? undefined,
    href: `/accounts/${company.id}`,
    metadata: { accountPriority: company.accountPriority },
  });
}

function addPersonNode(
  acc: GraphAccumulator,
  person: { id: string; fullName: string; title: string | null; persona: string | null },
  companyName?: string | null,
) {
  const id = nodeId("person", person.id);
  acc.addNode({
    id,
    type: "person",
    entityId: person.id,
    label: person.fullName,
    subtitle: [person.title, companyName].filter(Boolean).join(" · ") || undefined,
    href: undefined,
    metadata: { persona: person.persona },
  });
}

function addOpportunityNode(
  acc: GraphAccumulator,
  lead: {
    id: string;
    totalScore: number;
    priorityScore: number;
    status: string;
    opportunityHypothesis?: { workflows: string[]; rationale?: string } | null;
  },
) {
  const id = nodeId("opportunity", lead.id);
  const wf = lead.opportunityHypothesis?.workflows?.[0];
  acc.addNode({
    id,
    type: "opportunity",
    entityId: lead.id,
    label: "Opportunity",
    subtitle: wf ? workflowLabel(wf as import("@/lib/icp/types").WorkflowType) : "GeneralMind fit",
    score: lead.totalScore,
    confidence: lead.priorityScore,
    status: lead.status,
    href: `/leads/${lead.id}`,
  });
}

function linkPersonEvent(
  acc: GraphAccumulator,
  personId: string,
  eventId: string,
  attendanceType: string,
  attendanceConfidence: number,
  explanation?: string,
) {
  const et = attendanceEdgeType(attendanceType);
  const verification = attendanceVerification(attendanceType, attendanceConfidence);
  acc.addEdge({
    id: edgeId(et, nodeId("person", personId), nodeId("event", eventId)),
    source: nodeId("person", personId),
    target: nodeId("event", eventId),
    type: et,
    label: et.replace(/_/g, " "),
    confidence: attendanceConfidence,
    verification,
    explanation:
      explanation ??
      (verification === "verified"
        ? "Attendance link supported by official or high-confidence evidence."
        : "Company participates at the event; this person's own attendance is not independently verified."),
  });
}

function linkCompanyEvent(
  acc: GraphAccumulator,
  companyId: string,
  eventId: string,
  associationType: string,
  confidence: number,
  evidenceText?: string | null,
) {
  const et = associationEdgeType(associationType);
  const verification = associationVerification(associationType, confidence);
  acc.addEdge({
    id: edgeId(et, nodeId("company", companyId), nodeId("event", eventId)),
    source: nodeId("company", companyId),
    target: nodeId("event", eventId),
    type: et,
    label: associationType.replace(/_/g, " "),
    confidence,
    verification,
    explanation: evidenceText?.slice(0, 220) ?? undefined,
  });
}

async function addCompanyIntelligence(
  acc: GraphAccumulator,
  companyId: string,
  opportunityLeadId?: string,
  opts?: { maxSignals?: number },
) {
  const sigs = await fetchCompanySignals(companyId, opts?.maxSignals ?? MAX_SIGNALS);
  const hintsPerSignal = (opts?.maxSignals ?? MAX_SIGNALS) <= 2 ? 1 : 2;
  for (const s of sigs) {
    const sid = nodeId("signal", s.id);
    acc.addNode({
      id: sid,
      type: "signal",
      entityId: s.id,
      label: signalTypeLabel(s.type) ?? s.type,
      subtitle: s.title.slice(0, 80),
      confidence: s.confidence,
      metadata: { direction: s.direction, occurredAt: s.occurredAt?.toISOString() },
    });
    acc.addEdge({
      id: edgeId("signal_for", sid, nodeId("company", companyId)),
      source: sid,
      target: nodeId("company", companyId),
      type: "signal_for",
      confidence: s.confidence,
      verification: s.confidence >= 75 ? "verified" : "inferred",
      explanation: s.summary.slice(0, 200),
    });
    for (const hint of s.workflowHints.slice(0, hintsPerSignal)) {
      const wid = workflowNodeId(companyId, hint);
      acc.addNode({
        id: wid,
        type: "workflow",
        entityId: hint,
        label: workflowLabel(hint as import("@/lib/icp/types").WorkflowType),
        subtitle: "Workflow hint",
      });
      acc.addEdge({
        id: edgeId("suggests_workflow", sid, wid),
        source: sid,
        target: wid,
        type: "suggests_workflow",
        confidence: s.relevance,
        verification: s.direction === "negative" ? "inferred" : "verified",
        explanation: s.direction === "negative" ? "Negative or conflicting signal." : undefined,
      });
      if (opportunityLeadId) {
        acc.addEdge({
          id: edgeId("supports_opportunity", wid, nodeId("opportunity", opportunityLeadId)),
          source: wid,
          target: nodeId("opportunity", opportunityLeadId),
          type: "supports_opportunity",
          confidence: s.confidence,
          verification: "inferred",
        });
      }
    }
  }

  const clusters = await fetchSignalClusters(companyId);
  for (const c of clusters.slice(0, (opts?.maxSignals ?? MAX_SIGNALS) <= 2 ? 1 : 4)) {
    const wid = workflowNodeId(companyId, c.workflow);
    if (!acc.hasNode(wid)) {
      acc.addNode({
        id: wid,
        type: "workflow",
        entityId: c.workflow,
        label: workflowLabel(c.workflow as import("@/lib/icp/types").WorkflowType),
        subtitle: `${c.signalIds.length} aligned signals`,
        confidence: c.confidence,
      });
    }
    if (opportunityLeadId) {
      acc.addEdge({
        id: edgeId("supports_opportunity", wid, nodeId("opportunity", opportunityLeadId)),
        source: wid,
        target: nodeId("opportunity", opportunityLeadId),
        type: "supports_opportunity",
        confidence: c.confidence,
        verification: c.confidence >= 70 ? "verified" : "inferred",
      });
    }
  }
}

function addEvidenceNodes(
  acc: GraphAccumulator,
  evidence: Awaited<ReturnType<typeof fetchEvidenceForLeads>>,
  opportunityId: string,
) {
  for (const e of evidence.slice(0, MAX_EVIDENCE)) {
    const eid = nodeId("evidence", e.id);
    const verified = evidenceSourceIsVerified(e.sourceType);
    acc.addNode({
      id: eid,
      type: "evidence",
      entityId: e.id,
      label: e.sourceType.replace(/_/g, " "),
      subtitle: e.sourceTitle?.slice(0, 60) ?? e.evidenceText.slice(0, 60),
      confidence: e.confidence,
      metadata: { sourceUrl: e.sourceUrl, retrievedAt: e.retrievedAt.toISOString() },
    });
    acc.addEdge({
      id: edgeId("evidence_for", eid, nodeId("opportunity", opportunityId)),
      source: eid,
      target: nodeId("opportunity", opportunityId),
      type: "evidence_for",
      confidence: e.confidence,
      verification: verified ? "verified" : "inferred",
      explanation: e.evidenceText.slice(0, 240),
      evidenceIds: [e.id],
    });
  }
}

export async function buildOpportunityGraph(entityId: string): Promise<GraphViewModel | null> {
  const detail = await getLeadDetail(entityId);
  if (!detail) return null;
  const acc = new GraphAccumulator();
  const root = nodeId("opportunity", detail.lead.id);

  addOpportunityNode(acc, {
    id: detail.lead.id,
    totalScore: detail.lead.totalScore,
    priorityScore: detail.lead.priorityScore,
    status: detail.lead.status,
    opportunityHypothesis: detail.lead.opportunityHypothesis,
  });
  addEventNode(acc, detail.event);
  addPersonNode(acc, detail.person, detail.company?.name);
  if (detail.company) addCompanyNode(acc, detail.company);

  if (detail.company) {
    acc.addEdge({
      id: edgeId("employed_by", nodeId("person", detail.person.id), nodeId("company", detail.company.id)),
      source: nodeId("person", detail.person.id),
      target: nodeId("company", detail.company.id),
      type: "employed_by",
      confidence: 85,
      verification: "inferred",
      explanation: "Person is associated with this account in the lead record.",
    });
    await addCompanyIntelligence(acc, detail.company.id, detail.lead.id, { maxSignals: 2 });
  }

  linkPersonEvent(
    acc,
    detail.person.id,
    detail.event.id,
    detail.lead.attendanceType,
    detail.lead.attendanceConfidence,
  );

  if (detail.company) {
    const links = await fetchEventCompanies(detail.event.id);
    const link = links.find((l) => l.company.id === detail.company!.id);
    if (link) {
      linkCompanyEvent(acc, detail.company.id, detail.event.id, link.link.associationType, link.link.confidence, link.link.evidenceText);
    }
  }

  addEvidenceNodes(acc, detail.evidence.slice(0, 2), detail.lead.id);

  for (const w of (detail.lead.opportunityHypothesis?.workflows ?? []).slice(0, 1)) {
    if (!detail.company) continue;
    const wid = workflowNodeId(detail.company.id, w);
    acc.addNode({
      id: wid,
      type: "workflow",
      entityId: w,
      label: workflowLabel(w as import("@/lib/icp/types").WorkflowType),
      subtitle: "Opportunity hypothesis",
    });
    acc.addEdge({
      id: edgeId("supports_opportunity", wid, root),
      source: wid,
      target: root,
      type: "supports_opportunity",
      confidence: detail.lead.opportunityHypothesis?.confidence ?? 60,
      verification:
        detail.lead.opportunityHypothesis?.classification === "evidence_backed" ? "verified" : "inferred",
    });
  }

  if (detail.lead.status === "approved" || detail.lead.status === "hubspot_synced") {
    acc.addEdge({
      id: edgeId("approved_as", nodeId("person", detail.person.id), root),
      source: nodeId("person", detail.person.id),
      target: root,
      type: "approved_as",
      verification: "verified",
      explanation: "Human reviewer approved this lead.",
    });
  }
  if (detail.lead.status === "hubspot_synced" && detail.syncs.some((s) => s.status === "synced")) {
    acc.addEdge({
      id: edgeId("synced_to", root, nodeId("person", detail.person.id)),
      source: root,
      target: nodeId("person", detail.person.id),
      type: "synced_to",
      verification: "verified",
      explanation: "Synced to CRM after approval.",
    });
  }

  return pruneGraph(finalize(acc, "opportunity", root), 15);
}

export async function buildEventGraph(entityId: string, runActive = false): Promise<GraphViewModel | null> {
  const event = await fetchEventRow(entityId);
  if (!event) return null;
  const acc = new GraphAccumulator();
  const root = nodeId("event", event.id);
  const rows = await listEventLeadRows(entityId);
  addEventNode(acc, event, rows.length);

  const companies = await fetchEventCompanies(entityId);
  for (const { link, company } of companies.slice(0, MAX_EVENT_COMPANIES)) {
    addCompanyNode(acc, company);
    linkCompanyEvent(acc, company.id, event.id, link.associationType, link.confidence, link.evidenceText);
  }

  for (const r of rows.slice(0, MAX_EVENT_LEADS)) {
    addPersonNode(acc, r.person, r.company?.name ?? undefined);
    if (r.company) {
      addCompanyNode(acc, r.company);
      acc.addEdge({
        id: edgeId("employed_by", nodeId("person", r.person.id), nodeId("company", r.company.id)),
        source: nodeId("person", r.person.id),
        target: nodeId("company", r.company.id),
        type: "employed_by",
        verification: "inferred",
        confidence: 80,
      });
    }
    if (r.lead.totalScore >= 55) {
      addOpportunityNode(acc, r.lead);
      acc.addEdge({
        id: edgeId("supports_opportunity", nodeId("person", r.person.id), nodeId("opportunity", r.lead.id)),
        source: nodeId("person", r.person.id),
        target: nodeId("opportunity", r.lead.id),
        type: "supports_opportunity",
        confidence: r.lead.totalScore,
        verification: "inferred",
      });
    }
    linkPersonEvent(acc, r.person.id, event.id, r.lead.attendanceType, r.lead.attendanceConfidence);
  }

  const model = finalize(acc, "event", root);
  if (runActive) {
    model.edges = model.edges.map((e) => ({ ...e, animated: e.verification === "verified" && e.type !== "employed_by" }));
  }
  return model;
}

export async function buildCompanyGraph(entityId: string): Promise<GraphViewModel | null> {
  const company = await fetchCompanyRow(entityId);
  if (!company) return null;
  const acc = new GraphAccumulator();
  const root = nodeId("company", company.id);
  addCompanyNode(acc, company);
  await addCompanyIntelligence(acc, company.id);

  const links = await getDb().select().from(eventCompanies).where(eq(eventCompanies.companyId, entityId)).limit(8);
  for (const link of links) {
    const event = await fetchEventRow(link.eventId);
    if (event) {
      addEventNode(acc, event);
      linkCompanyEvent(acc, company.id, event.id, link.associationType, link.confidence, link.evidenceText);
    }
  }

  const rows = await listEventLeadRowsForCompany(entityId);
  for (const r of rows.slice(0, 12)) {
    addPersonNode(acc, r.person, company.name);
    acc.addEdge({
      id: edgeId("employed_by", nodeId("person", r.person.id), root),
      source: nodeId("person", r.person.id),
      target: root,
      type: "employed_by",
      verification: "inferred",
      confidence: 80,
    });
    if (r.lead.totalScore >= 55) {
      addOpportunityNode(acc, r.lead);
      acc.addEdge({
        id: edgeId("supports_opportunity", root, nodeId("opportunity", r.lead.id)),
        source: root,
        target: nodeId("opportunity", r.lead.id),
        type: "supports_opportunity",
        confidence: r.lead.priorityScore,
        verification: "inferred",
      });
    }
  }

  return finalize(acc, "company", root);
}

async function listEventLeadRowsForCompany(companyId: string) {
  return getDb()
    .select({ lead: eventLeads, person: people })
    .from(eventLeads)
    .innerJoin(people, eq(people.id, eventLeads.personId))
    .where(eq(eventLeads.companyId, companyId))
    .orderBy(desc(eventLeads.priorityScore))
    .limit(15);
}

export async function buildMarketGraph(): Promise<GraphViewModel> {
  const acc = new GraphAccumulator();
  const { topEvents, leads, companySignals } = await fetchMarketSlice({ minScore: 55, limitEvents: 5, limitLeads: 12 });

  for (const { event, leadCount } of topEvents) addEventNode(acc, event, leadCount);

  const seenCompanies = new Set<string>();
  for (const r of leads) {
    if (r.company && !seenCompanies.has(r.company.id)) {
      seenCompanies.add(r.company.id);
      addCompanyNode(acc, r.company);
    }
    addPersonNode(acc, r.person, r.company?.name);
    addEventNode(acc, r.event);
    addOpportunityNode(acc, r.lead);
    linkPersonEvent(acc, r.person.id, r.event.id, r.lead.attendanceType, r.lead.attendanceConfidence);
    if (r.company) {
      acc.addEdge({
        id: edgeId("employed_by", nodeId("person", r.person.id), nodeId("company", r.company.id)),
        source: nodeId("person", r.person.id),
        target: nodeId("company", r.company.id),
        type: "employed_by",
        verification: "inferred",
        confidence: 75,
      });
      acc.addEdge({
        id: edgeId("supports_opportunity", nodeId("company", r.company.id), nodeId("opportunity", r.lead.id)),
        source: nodeId("company", r.company.id),
        target: nodeId("opportunity", r.lead.id),
        type: "supports_opportunity",
        confidence: r.lead.totalScore,
        verification: "inferred",
      });
    }
  }

  for (const s of companySignals.slice(0, 10)) {
    const cid = nodeId("company", s.companyId);
    if (!acc.hasNode(cid)) continue;
    const sid = nodeId("signal", s.id);
    acc.addNode({
      id: sid,
      type: "signal",
      entityId: s.id,
      label: signalTypeLabel(s.type) ?? s.type,
      subtitle: s.title.slice(0, 60),
      confidence: s.confidence,
    });
    acc.addEdge({
      id: edgeId("signal_for", sid, cid),
      source: sid,
      target: cid,
      type: "signal_for",
      confidence: s.confidence,
      verification: s.confidence >= 75 ? "verified" : "inferred",
    });
  }

  if (acc.snapshot().nodes.length === 0) {
    const selected = await listEvents({ statuses: ["selected"] });
    for (const event of selected.slice(0, 8)) {
      addEventNode(acc, event, event.leadCount ?? 0);
    }
    const withLeads = await fetchMarketSlice({ minScore: 0, limitEvents: 4, limitLeads: 10 });
    for (const { event, leadCount } of withLeads.topEvents) addEventNode(acc, event, leadCount);
    for (const r of withLeads.leads) {
      addEventNode(acc, r.event);
      addPersonNode(acc, r.person, r.company?.name);
      addOpportunityNode(acc, r.lead);
      if (r.company) addCompanyNode(acc, r.company);
      linkPersonEvent(acc, r.person.id, r.event.id, r.lead.attendanceType, r.lead.attendanceConfidence);
    }
  }

  return finalize(acc, "market");
}

export async function buildGraph(params: GraphQueryParams): Promise<GraphViewModel | null> {
  let model: GraphViewModel | null = null;
  switch (params.scope) {
    case "opportunity":
      if (!params.entityId) return null;
      model = await buildOpportunityGraph(params.entityId);
      break;
    case "event":
      if (!params.entityId) return null;
      model = await buildEventGraph(params.entityId, Boolean(params.runId));
      break;
    case "company":
      if (!params.entityId) return null;
      model = await buildCompanyGraph(params.entityId);
      break;
    case "market":
      model = await buildMarketGraph();
      break;
  }
  if (!model) return null;
  return applyGraphFilters(model, {
    minConfidence: params.minConfidence,
    minScore: params.minScore,
    nodeTypes: params.nodeTypes,
  });
}
