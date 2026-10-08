import type { PlannedQuery, ResearchTarget, WorkflowType } from "./types";

export function generateOrthogonalQueries(
  target: ResearchTarget,
  workflow: WorkflowType = "p2p",
): PlannedQuery[] {
  const name = target.name.trim();
  const domain = target.domain?.trim();
  const event = target.eventName?.trim();
  const person = target.personName?.trim();

  const queries: PlannedQuery[] = [];
  let idCounter = 1;

  // 1. PERSONA LANE
  if (person) {
    queries.push({
      id: `q-${idCounter++}`,
      lane: "persona",
      query: `"${person}" "${name}" ${domain ? `site:${domain} OR ` : ""}(title OR role OR linkedin OR appointed OR VP OR Director)`,
      expectedInformationGain: 0.9,
      estimatedCost: 0.05,
      priority: 5,
      resolves: ["personas.operational_buyer", "personas.workflow_owner"],
      independentOf: [],
    });
  } else {
    queries.push({
      id: `q-${idCounter++}`,
      lane: "persona",
      query: `"${name}" ("VP Procurement" OR "Chief Procurement Officer" OR "VP Supply Chain" OR "Head of Procurement")`,
      expectedInformationGain: 0.85,
      estimatedCost: 0.05,
      priority: 5,
      resolves: ["personas.operational_buyer"],
      independentOf: [],
    });
  }

  // 2. TRANSFORMATION LANE
  queries.push({
    id: `q-${idCounter++}`,
    lane: "transformation",
    query: `"${name}" ("procurement transformation" OR "supply chain modernization" OR "digital operations initiative" OR "shared services")`,
    expectedInformationGain: 0.8,
    estimatedCost: 0.05,
    priority: 4,
    resolves: ["signals.transformation"],
    independentOf: ["personas.operational_buyer"],
  });

  // 3. TECHNOLOGY LANE
  queries.push({
    id: `q-${idCounter++}`,
    lane: "technology",
    query: `"${name}" ("SAP S/4HANA" OR "Oracle Fusion" OR "Coupa" OR "SAP Ariba" OR "NetSuite") ERP`,
    expectedInformationGain: 0.85,
    estimatedCost: 0.05,
    priority: 4,
    resolves: ["technology.erp", "technology.procurement_suite"],
    independentOf: ["signals.transformation"],
  });

  // 4. INTENT LANE
  if (event) {
    queries.push({
      id: `q-${idCounter++}`,
      lane: "intent",
      query: `"${name}" "${event}" (speaker OR sponsor OR attendee OR panel OR keynote)`,
      expectedInformationGain: 0.9,
      estimatedCost: 0.05,
      priority: 5,
      resolves: ["signals.event_connection", "personas.event_attendee"],
      independentOf: [],
    });
  } else {
    queries.push({
      id: `q-${idCounter++}`,
      lane: "intent",
      query: `"${name}" (expansion OR "new distribution center" OR "hiring procurement" OR "strategic partnership" 2026)`,
      expectedInformationGain: 0.75,
      estimatedCost: 0.05,
      priority: 3,
      resolves: ["signals.hiring_expansion"],
      independentOf: [],
    });
  }

  // 5. WORKFLOW LANE
  if (workflow === "p2p" || workflow === "ap_automation") {
    queries.push({
      id: `q-${idCounter++}`,
      lane: "workflow",
      query: `"${name}" ("accounts payable exceptions" OR "supplier invoice disputes" OR "PO matching" OR "manual invoicing")`,
      expectedInformationGain: 0.8,
      estimatedCost: 0.05,
      priority: 4,
      resolves: ["workflow.p2p_pain"],
      independentOf: ["technology.erp"],
    });
  } else {
    queries.push({
      id: `q-${idCounter++}`,
      lane: "workflow",
      query: `"${name}" ("order processing exceptions" OR "order-to-cash disputes" OR "fulfillment exceptions")`,
      expectedInformationGain: 0.8,
      estimatedCost: 0.05,
      priority: 4,
      resolves: ["workflow.o2c_pain"],
      independentOf: ["technology.erp"],
    });
  }

  // 6. DISCONFIRMATION LANE (Mandatory negative hypothesis search)
  queries.push({
    id: `q-${idCounter++}`,
    lane: "disconfirmation",
    query: `"${name}" ("100% touchless AP" OR "fully automated order processing" OR "automated with" OR "implemented Coupa 2025" OR "implemented Basware")`,
    expectedInformationGain: 0.85,
    estimatedCost: 0.05,
    priority: 5,
    resolves: ["negative.already_automated", "negative.wrong_timing"],
    independentOf: ["workflow.p2p_pain"],
  });

  return queries;
}
