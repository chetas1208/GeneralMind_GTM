/**
 * Resolve missing company domains via Exa + pickCompanyDomain (safe, no Apollo required).
 * Run: pnpm exec tsx scripts/backfill-company-domains.ts
 */
import "dotenv/config";
import { eq, isNull } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../lib/db/schema";
import { pickCompanyDomain } from "../lib/company-domain";

async function exaCompanySearch(name: string) {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": process.env.EXA_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({
      query: `${name} official website`,
      category: "company",
      numResults: 5,
      contents: { text: { maxCharacters: 300 } },
    }),
  });
  const j = (await res.json()) as { results?: { url: string; title?: string }[] };
  return j.results ?? [];
}

async function main() {
  const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
  const rows = await db.select().from(schema.companies).where(isNull(schema.companies.domain));
  let updated = 0;
  for (const c of rows) {
    const results = await exaCompanySearch(c.name);
    const domain = pickCompanyDomain(c.name, results);
    if (!domain) {
      console.log("skip", c.name);
      continue;
    }
    const [clash] = await db
      .select({ id: schema.companies.id, name: schema.companies.name })
      .from(schema.companies)
      .where(eq(schema.companies.domain, domain))
      .limit(1);
    if (clash && clash.id !== c.id) {
      console.log("skip", c.name, "(domain", domain, "already used by", clash.name + ")");
      continue;
    }
    await db.update(schema.companies).set({ domain, updatedAt: new Date() }).where(eq(schema.companies.id, c.id));
    console.log("ok", c.name, "→", domain);
    updated++;
  }
  console.log(`Updated ${updated} of ${rows.length} companies without a domain`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
