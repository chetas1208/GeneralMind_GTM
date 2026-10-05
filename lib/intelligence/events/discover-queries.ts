/** Multi-strategy Exa queries for upcoming operational / GTM-relevant events. */

export const EXCLUDE_EVENT_DOMAINS = [
  "eventbrite.com",
  "meetup.com",
  "allevents.in",
  "10times.com",
  "linkedin.com",
  "facebook.com",
  "conferenceindex.org",
  "wikipedia.org",
  "reddit.com",
  "youtube.com",
];

export function buildEventDiscoveryQueries(year = new Date().getUTCFullYear() + 1): string[] {
  const y = String(year);
  const themes = [
    "procurement conference speakers exhibitors",
    "supply chain summit operations leaders",
    "manufacturing operations executive conference",
    "SAP ERP customer conference manufacturing distribution",
    "accounts payable finance operations shared services summit",
    "order management order-to-cash conference",
    "industrial distribution wholesale convention exhibitors",
    "logistics supply chain expo exhibitor list",
    "food beverage manufacturing operations conference",
    "digital transformation manufacturing operations summit",
    "procure to pay automation conference",
    "metals industrial manufacturing trade show",
  ];
  return [
    ...themes.map((t) => `upcoming ${t} ${y}`),
    `${y} conference procurement speakers United States Europe`,
    `${y} supply chain summit exhibitors list official`,
    `${y} SAP conference operations finance`,
    `${y} manufacturing expo exhibitor directory`,
  ];
}
