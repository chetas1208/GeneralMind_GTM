/**
 * Prompt library. Every prompt: (1) states the JSON shape, (2) forbids inventing
 * facts, (3) tells the model to use null for anything not explicitly present.
 */

export const GENERALMIND_CONTEXT = `GeneralMind builds AI agents that automate operationally complex back-office workflows for mid-market and enterprise companies (order management, procurement, accounts payable, ERP-centred processes). Ideal buyers are operations, supply chain, procurement, finance-operations, and ERP/IT leaders at manufacturers, distributors, food & beverage, logistics, automotive, chemicals, and consumer-goods companies.`;

const NO_INVENTION = `Rules:
- Use ONLY information explicitly present in the provided text.
- If a field is not stated, use null (or [] for lists). Never guess.
- Output a single JSON object and nothing else.`;

export const prompts = {
  eventCandidate: (today: string) => ({
    system: `You extract structured data about a business event (conference, trade show, summit) from web page text.
Today's date is ${today}. ${NO_INVENTION}
Set "isEvent" to true ONLY if the page describes ONE specific, named event with a date in the future (on or after ${today}). Set false for event listings/aggregators, past events, webinars, meetups, blogs, and vendor pages.
"isOfficialSite" is true ONLY if this page is hosted on the event organiser's own website (the event's site, or the organiser's page for that specific event). It is false for news articles, press releases, blogs, directories, aggregators, venue listings and vendor posts. "officialUrl" is the event's own website URL ONLY if it is explicitly stated or linked in the text; otherwise null.
Dates must be ISO yyyy-mm-dd (use the first day for startDate, last day for endDate).
JSON shape:
{"isEvent":boolean,"isOfficialSite":boolean,"rationale":string,"name":string|null,"startDate":string|null,"endDate":string|null,"city":string|null,"region":string|null,"country":string|null,"venue":string|null,"description":string|null (<=400 chars, factual),"officialUrl":string|null,"registrationUrl":string|null,"industries":string[],"audiences":string[],"agendaThemes":string[]}`,
  }),

  eventAssessment: () => ({
    system: `${GENERALMIND_CONTEXT}
You assess whether an event is a good place to find GeneralMind's buyers. ${NO_INVENTION}
Rate categorically; do NOT output numeric scores.
- decisionMakerDensity: how likely operations / supply chain / procurement / finance-ops / ERP leaders attend or speak (low|medium|high), based on the agenda, speaker titles, and audience described.
- scale: breadth of participants (low|medium|high) based on stated attendee/exhibitor counts or the size of speaker/exhibitor lists.
- targetPersonas: job functions/titles from the text that match GeneralMind's buyers.
- reason: 1-3 factual sentences on why this event matters (or does not) for GeneralMind.
JSON shape:
{"decisionMakerDensity":"low|medium|high","scale":"low|medium|high","industries":string[],"audiences":string[],"targetPersonas":string[],"agendaThemes":string[],"reason":string}`,
  }),

  participants: (eventName: string, pageKind: string) => ({
    system: `You extract participants of the event "${eventName}" from a "${pageKind}" page. ${NO_INVENTION}
- "people": each individually named person with their stated job title and company, and their role at the event if stated (speaker, keynote, moderator, panelist).
- "companies": each organisation listed as sponsor, exhibitor, partner or organizer. Use relationship "speaker_company" only for a company known solely because its person speaks.
- Skip navigation text, generic words and anonymous mentions. Do not infer titles or companies.
JSON shape:
{"people":[{"name":string,"title":string|null,"company":string|null,"role":string|null}],"companies":[{"name":string,"relationship":"sponsor|exhibitor|partner|organizer|speaker_company|unknown"}]}`,
  }),

  persona: () => ({
    system: `Classify a job title into a buying-committee persona. ${NO_INVENTION}
persona must be one of: operations_leadership, supply_chain, procurement, order_management, finance_operations, it_erp, digital_transformation, executive_other, other.
seniority must be one of: c_suite, vp, head, director, manager, individual, unknown.
JSON shape: {"persona":string,"seniority":string}`,
  }),

  profileRole: () => ({
    system: `You read a public professional profile page and report the person's CURRENT role. ${NO_INVENTION}
- "isCurrent" is true only if the page shows the role as present/current (e.g. date range ending in "Present", or a headline stating it).
- "quote" MUST be copied verbatim from the page (<=200 chars) and support currentTitle and currentCompany. If you cannot quote it, set isCurrent=false.
JSON shape: {"fullName":string|null,"isCurrent":boolean,"currentTitle":string|null,"currentCompany":string|null,"quote":string|null}`,
  }),

  companyFit: () => ({
    system: `${GENERALMIND_CONTEXT}
Summarise, in <=3 factual sentences, why this company could or could not be an operationally complex fit, using only the supplied profile. List operational signals (e.g. "multi-plant manufacturing", "wholesale distribution") only if supported by the profile. ${NO_INVENTION}
JSON shape: {"summary":string,"operationalSignals":string[]}`,
  }),

  qualification: () => ({
    system: `${GENERALMIND_CONTEXT}
You write a concise qualification brief for a GTM operator reviewing a lead. The deterministic score and evidence are FIXED INPUTS; you explain them, you never change or strengthen them.
Hard rules:
- Never state or imply a person is attending unless attendance_type is official_speaker, organizer or public_attendance. For exhibitor/sponsor/partner employees or company-level participation say plainly that the person's attendance is NOT confirmed.
- Do not invent facts, quotes, URLs, or numbers. Refer only to the evidence provided.
- "uncertainty" must name what is unconfirmed (e.g. personal attendance, email, current role).
- "nextStep" is one practical action for the GTM operator.
JSON shape: {"whyCompanyFits":string,"whyPersonMatters":string,"eventLink":string,"uncertainty":string,"nextStep":string}`,
  }),
};
