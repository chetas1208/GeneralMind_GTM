export type CachedCompanyEntity = {
  domain: string;
  name: string;
  industry?: string | null;
  scale?: string | null;
  erpStack?: string[];
  operationalSignals?: string[];
  savedAt: number;
};

export type CachedPersonEntity = {
  fullName: string;
  domain: string;
  title?: string | null;
  persona?: string | null;
  linkedinUrl?: string | null;
  email?: string | null;
  savedAt: number;
};

const companyCache = new Map<string, CachedCompanyEntity>();
const personCache = new Map<string, CachedPersonEntity>();

// Entity data stays fresh for 7 days
const DEFAULT_ENTITY_TTL = 7 * 24 * 60 * 60 * 1000;

export function getCachedCompany(domainOrName: string): CachedCompanyEntity | null {
  const key = domainOrName.toLowerCase().trim();
  const entry = companyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > DEFAULT_ENTITY_TTL) {
    companyCache.delete(key);
    return null;
  }
  return entry;
}

export function setCachedCompany(domainOrName: string, data: Omit<CachedCompanyEntity, "savedAt">): void {
  const key = domainOrName.toLowerCase().trim();
  companyCache.set(key, { ...data, savedAt: Date.now() });
}

export function getCachedPerson(fullName: string, domain: string): CachedPersonEntity | null {
  const key = `${fullName.toLowerCase().trim()}@${domain.toLowerCase().trim()}`;
  const entry = personCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > DEFAULT_ENTITY_TTL) {
    personCache.delete(key);
    return null;
  }
  return entry;
}

export function setCachedPerson(data: Omit<CachedPersonEntity, "savedAt">): void {
  const key = `${data.fullName.toLowerCase().trim()}@${data.domain.toLowerCase().trim()}`;
  personCache.set(key, { ...data, savedAt: Date.now() });
}
