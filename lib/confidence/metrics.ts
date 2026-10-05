export const METRIC_COPY = {
  priority: {
    label: "Priority",
    description: "How actionable this opportunity is right now.",
    factors: ["Account fit", "Persona fit", "Signal strength", "Evidence quality", "Urgency", "Contactability"],
    interpretation: "Higher means this deserves attention sooner.",
  },
  momentum: {
    label: "Opportunity momentum",
    description: "How the strength of active opportunities changes over time.",
    factors: ["Priority of review-ready opportunities", "Evidence support", "How recently they appeared"],
    interpretation: "Higher means more recent, better-supported, higher-priority opportunities are active. The percent compares this window with the previous one of the same length.",
  },
  eventRelevance: {
    label: "Event relevance",
    description: "How well this event matches the target market.",
    factors: ["Target personas", "Industries", "Workflow themes", "Enterprise density", "Timing"],
    interpretation: "Strong relevance means the room is likely to contain the people and workflows you sell to.",
  },
  companyFit: {
    label: "Company fit",
    description: "How closely this account matches the ideal operational profile.",
    factors: ["Industry", "Scale", "ERP complexity", "Workflow complexity", "Operational signals"],
    interpretation: "Excellent or strong means the account looks like a real operational fit. Moderate means only part of the profile is visible.",
  },
  personaFit: {
    label: "Persona fit",
    description: "How closely this person's role maps to the workflow being targeted.",
    factors: ["Function", "Ownership of the workflow", "Seniority"],
    interpretation: "Seniority alone is not enough. Functional ownership is what moves this up.",
  },
  signalStrength: {
    label: "Signal strength",
    description: "How strongly the observed market signal suggests an active opportunity.",
    factors: ["Directness", "Recency", "Verification"],
    interpretation: "Direct, recent, verified signals contribute more than old or second-hand mentions.",
  },
  funnel: {
    label: "Funnel",
    description: "Counts of persisted records at each stage.",
    factors: ["Verified signals", "Accounts", "People", "Verified attendance", "Review-ready", "Approved", "CRM"],
    interpretation: "A conversion rate is the share of the previous stage that reached the next one in the records on file. It is not a forecast.",
  },
  opportunityQuality: {
    label: "Opportunity quality",
    description: "Average priority of the opportunities created that day.",
    factors: ["Priority scores of review-ready, approved, and synced leads"],
    interpretation: "Higher means the day's opportunities are stronger, not merely more numerous.",
  },
} as const;

export type MetricKey = keyof typeof METRIC_COPY;
