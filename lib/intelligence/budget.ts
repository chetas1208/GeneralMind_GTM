import "server-only";

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/** Operational caps — not shown in product UI. */
export function getIntelligenceBudget() {
  return {
    maxCompaniesPerEvent: int(process.env.MAX_COMPANIES_PER_EVENT, 30),
    maxPeoplePerCompany: int(process.env.MAX_PEOPLE_PER_COMPANY, 6),
    maxEnrichmentsPerEvent: int(process.env.MAX_ENRICHMENTS_PER_EVENT, 50),
    maxPeopleSearchPerCompany: int(process.env.MAX_PEOPLE_SEARCH_PER_COMPANY, 8),
    topEventsLimit: int(process.env.TOP_EVENTS_LIMIT, 10),
  };
}
