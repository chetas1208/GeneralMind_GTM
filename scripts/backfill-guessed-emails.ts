/**
 * Apply pattern email guesses for leads with company domain but no email.
 * Run: pnpm exec tsx scripts/backfill-guessed-emails.ts
 */
import "dotenv/config";
import { and, eq, isNull } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { pickPrimaryEmailGuess, UNVERIFIED_EMAIL_STATUS } from "../lib/contact/email-guess";
import * as schema from "../lib/db/schema";

const { companies, eventLeads, people } = schema;

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql, { schema });
  const rows = await db
    .select({
      leadId: eventLeads.id,
      fullName: people.fullName,
      firstName: people.firstName,
      lastName: people.lastName,
      personId: people.id,
      domain: companies.domain,
      companyName: companies.name,
    })
    .from(eventLeads)
    .innerJoin(people, eq(people.id, eventLeads.personId))
    .innerJoin(companies, eq(companies.id, eventLeads.companyId))
    .where(and(isNull(people.email), eq(eventLeads.status, "needs_review")));

  let applied = 0;
  for (const r of rows) {
    if (!r.domain) continue;
    const guess = pickPrimaryEmailGuess({ firstName: r.firstName, lastName: r.lastName, fullName: r.fullName, domain: r.domain });
    if (!guess) continue;
    const [clash] = await db.select({ id: people.id }).from(people).where(eq(people.email, guess)).limit(1);
    if (clash && clash.id !== r.personId) continue;
    await db.update(people).set({ email: guess, emailStatus: UNVERIFIED_EMAIL_STATUS, updatedAt: new Date() }).where(eq(people.id, r.personId));
    applied++;
    console.log(`${r.fullName} @ ${r.companyName}: ${guess} (unverified)`);
  }
  console.log(`Done. Applied ${applied} unverified email(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
