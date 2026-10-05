import { eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { companies, people, signals } from "@/lib/db/schema";
import type * as schema from "@/lib/db/schema";
import { scoreCompanyFit } from "@/lib/icp/company-fit";
import { buildWhyNow, computeAccountPriority, type ScoredSignal } from "./scoring";
import type { SignalType } from "./types";

type Db = NeonHttpDatabase<typeof schema>;

export async function updateAccountIntelligenceWithDb(db: Db, companyId: string, opts: { externalRefreshAt?: string } = {}): Promise<void> {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!company) return;

  const sigRows = await db.select().from(signals).where(eq(signals.companyId, companyId));
  const scored: ScoredSignal[] = sigRows
    .filter((s) => s.status === "verified")
    .map((s) => ({
      id: s.id,
      type: s.type as SignalType,
      direction: s.direction,
      confidence: s.confidence,
      relevance: s.relevance,
      urgency: s.urgency,
      workflowHints: s.workflowHints,
      occurredAt: s.occurredAt,
    }));

  const fit = scoreCompanyFit({
    industry: company.industry,
    description: company.description,
    employeeCount: company.employeeCount,
    country: company.country,
    technologies: company.erpSignals,
  });

  const peopleRows = await db.select().from(people).where(eq(people.companyId, companyId));
  const hasEmail = peopleRows.some((p) => Boolean(p.email));

  const priority = computeAccountPriority({
    accountFit: fit.total,
    signals: scored,
    contactability: hasEmail ? 4 : 0,
  });

  const whyNow = buildWhyNow(scored, company.name);
  const stackPts = priority.breakdown.find((b) => b.key === "stack")?.points ?? 0;

  await db
    .update(companies)
    .set({
      accountPriority: priority.total,
      intelligenceUpdatedAt: new Date(),
      accountIntelligence: {
        whyNow,
        whyGeneralMind:
          "Signals point at coordination between email/documents and ERP-style systems — plausible GeneralMind workflows include PO confirmation, supplier follow-up, AP documents, and exception handling.",
        discoveryAngle: "How much of supplier and customer coordination still happens outside SAP via email?",
        activeSignalCount: scored.filter((s) => s.direction === "positive").length,
        alignedClusterCount: stackPts > 0 ? Math.min(4, Math.ceil(stackPts / 2)) : 0,
        stackingBonus: stackPts,
        priorityBreakdown: priority.breakdown,
        externalRefreshAt: opts.externalRefreshAt ?? company.accountIntelligence?.externalRefreshAt,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId));
}
