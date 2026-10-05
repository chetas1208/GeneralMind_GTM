import type { IndustryTier } from "./types";

export const INDUSTRY_TIER_A = [
  "industrial manufacturing",
  "industrial distribution",
  "wholesale distribution",
  "metals",
  "metal",
  "chemical",
  "automotive",
  "food",
  "beverage",
  "consumer goods",
  "logistic",
  "supply chain",
  "industrial equipment",
  "electronics manufactur",
  "pharmaceutical manufactur",
  "manufactur",
  "industrial",
  "machinery",
  "distribution",
  "wholesale",
] as const;

export const INDUSTRY_TIER_B = [
  "retail",
  "construction",
  "packaging",
  "aerospace",
  "energy equipment",
  "medical device",
  "import",
  "export",
  "building materials",
  "utilities",
  "mining",
  "steel",
  "defense",
  "agricultur",
  "paper",
  "textile",
] as const;

export const INDUSTRY_TIER_C = [
  "software",
  "saas",
  "agency",
  "marketing agency",
  "consulting firm",
  "venture",
  "mobile app",
  "crypto",
  "game studio",
] as const;

export function classifyIndustryTier(corpus: string): IndustryTier {
  const t = corpus.toLowerCase();
  if (INDUSTRY_TIER_C.some((k) => t.includes(k))) return "C";
  if (INDUSTRY_TIER_A.some((k) => t.includes(k))) return "A";
  if (INDUSTRY_TIER_B.some((k) => t.includes(k))) return "B";
  return "C";
}

export function industryTierPoints(tier: IndustryTier): number {
  if (tier === "A") return 10;
  if (tier === "B") return 5;
  return 1;
}
