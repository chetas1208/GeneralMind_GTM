import "server-only";
import { eq } from "drizzle-orm";
import { isVerifiedEmailStatus, pickPrimaryEmailGuess, UNVERIFIED_EMAIL_STATUS } from "@/lib/contact/email-guess";
import { getDb } from "@/lib/db";
import { getCompany } from "@/lib/db/queries/companies";
import { addEvidence, getLeadRow } from "@/lib/db/queries/leads";
import { getPerson, upsertPerson } from "@/lib/db/queries/people";
import { eventLeads, people } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";
import { updateAccountIntelligence } from "@/lib/signals/refresh";
import { EVIDENCE_CONFIDENCE } from "@/lib/pipeline/stages/shared";

const log = createLogger("guessed-email");

/** Attach a pattern-based work email when none exists (never overwrites verified/manual email). */
export async function applyGuessedEmailForLead(leadId: string): Promise<{ applied: boolean; email?: string }> {
  const lead = await getLeadRow(leadId);
  if (!lead?.companyId) return { applied: false };
  const person = await getPerson(lead.personId);
  if (!person) return { applied: false };
  if (person.email && isVerifiedEmailStatus(person.emailStatus)) return { applied: false };
  if (person.email && (person.emailStatus === UNVERIFIED_EMAIL_STATUS || person.emailStatus === "guessed_unverified")) {
    return { applied: false, email: person.email };
  }

  const company = await getCompany(lead.companyId);
  if (!company?.domain) return { applied: false };

  const guess = pickPrimaryEmailGuess({
    firstName: person.firstName,
    lastName: person.lastName,
    fullName: person.fullName,
    domain: company.domain,
  });
  if (!guess) return { applied: false };

  const db = getDb();
  const [clash] = await db.select({ id: people.id }).from(people).where(eq(people.email, guess)).limit(1);
  if (clash && clash.id !== person.id) {
    log.info("guess email taken by another person", { leadId, guess });
    return { applied: false };
  }

  await upsertPerson({
    fullName: person.fullName,
    companyId: company.id,
    email: guess,
    emailStatus: UNVERIFIED_EMAIL_STATUS,
  });

  const leadRows = await db.select({ id: eventLeads.id }).from(eventLeads).where(eq(eventLeads.personId, person.id));
  for (const l of leadRows) {
    await addEvidence({
      eventLeadId: l.id,
      sourceType: "inference",
      evidenceText: `Inferred work email ${guess} from company domain ${company.domain} (unverified — confirm before outreach).`,
      confidence: EVIDENCE_CONFIDENCE.inference,
    });
  }
  await updateAccountIntelligence(company.id);
  log.info("unverified email applied", { leadId, email: guess });
  return { applied: true, email: guess };
}
