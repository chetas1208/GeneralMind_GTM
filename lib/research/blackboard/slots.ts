import type { KnowledgeSlot } from "./types";

export function createDefaultSlots(): Record<string, KnowledgeSlot> {
  const now = new Date().toISOString();
  const defs: Omit<KnowledgeSlot, "state" | "confidenceBand" | "evidenceIds" | "lastUpdatedAt">[] = [
    // Company slots
    { key: "company.industry", category: "company", label: "Industry & Segment", weight: 3 },
    { key: "company.scale", category: "company", label: "Scale & Revenue/Employees", weight: 3 },
    { key: "company.locations", category: "company", label: "Facilities & Locations", weight: 2 },

    // Technology slots
    { key: "technology.erp", category: "technology", label: "ERP Stack (SAP, Oracle, NetSuite)", weight: 4 },
    { key: "technology.automation", category: "technology", label: "Existing Automation Tools", weight: 3 },
    { key: "technology.procurement_suite", category: "technology", label: "Procurement / AP Suite (Coupa, Ariba)", weight: 4 },

    // Personas slots
    { key: "personas.operational_buyer", category: "personas", label: "Operational Buyer (VP Procurement / Ops)", weight: 5 },
    { key: "personas.workflow_owner", category: "personas", label: "Workflow Owner / Director", weight: 5 },
    { key: "personas.event_attendee", category: "personas", label: "Verified Event Attendance", weight: 5 },

    // Signals slots
    { key: "signals.event_connection", category: "signals", label: "Event Presence / Sponsorship / Speaker", weight: 5 },
    { key: "signals.transformation", category: "signals", label: "Active Transformation / Modernization", weight: 5 },
    { key: "signals.hiring_expansion", category: "signals", label: "Hiring or Facility Expansion", weight: 3 },

    // Workflow slots
    { key: "workflow.p2p_pain", category: "workflow", label: "Procure-to-Pay / AP Exception Pain", weight: 4 },
    { key: "workflow.o2c_pain", category: "workflow", label: "Order-to-Cash / Order Exception Pain", weight: 4 },

    // Negative / Disconfirmation slots
    { key: "negative.already_automated", category: "negative", label: "Workflow Already Touchless/Automated", weight: 5 },
    { key: "negative.wrong_timing", category: "negative", label: "Recent Competing Implementation / Freeze", weight: 4 },
    { key: "negative.person_departed", category: "negative", label: "Target Person No Longer in Role", weight: 5 },
  ];

  const map: Record<string, KnowledgeSlot> = {};
  for (const d of defs) {
    map[d.key] = {
      ...d,
      state: "unknown",
      confidenceBand: "unverified",
      evidenceIds: [],
      lastUpdatedAt: now,
    };
  }
  return map;
}
