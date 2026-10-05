import { desc, eq, ilike, or } from "drizzle-orm";
import { handle, json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { companies, events, people, signals } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Global ⌘K search — people, companies, events only. */
export async function GET(request: Request) {
  return handle(async () => {
    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) return json({ people: [], companies: [], events: [], signals: [] });

    const pattern = `%${q}%`;
    const db = getDb();
    const [peopleRows, companyRows, eventRows, signalRows] = await Promise.all([
      db
        .select({
          id: people.id,
          fullName: people.fullName,
          title: people.title,
          companyName: companies.name,
        })
        .from(people)
        .leftJoin(companies, eq(people.companyId, companies.id))
        .where(or(ilike(people.fullName, pattern), ilike(people.title, pattern)))
        .limit(8),
      db.select({ id: companies.id, name: companies.name, domain: companies.domain }).from(companies).where(ilike(companies.name, pattern)).limit(8),
      db.select({ id: events.id, name: events.name, startDate: events.startDate }).from(events).where(ilike(events.name, pattern)).limit(8),
      db
        .select({
          id: signals.id,
          title: signals.title,
          type: signals.type,
          companyId: companies.id,
          companyName: companies.name,
        })
        .from(signals)
        .innerJoin(companies, eq(companies.id, signals.companyId))
        .where(or(ilike(signals.title, pattern), ilike(signals.summary, pattern), ilike(companies.name, pattern)))
        .orderBy(desc(signals.discoveredAt))
        .limit(8),
    ]);

    return json({
      people: peopleRows.map((p) => ({
        id: p.id,
        label: p.fullName,
        sub: [p.title, p.companyName].filter(Boolean).join(" · "),
        href: `/leads?q=${encodeURIComponent(p.fullName)}`,
      })),
      companies: companyRows.map((c) => ({
        id: c.id,
        label: c.name,
        sub: c.domain ?? "",
        href: `/accounts/${c.id}`,
      })),
      signals: signalRows.map((s) => ({
        id: s.id,
        label: s.title,
        sub: s.companyName,
        href: `/accounts/${s.companyId}`,
      })),
      events: eventRows.map((e) => ({
        id: e.id,
        label: e.name,
        sub: e.startDate ?? "",
        href: `/events/${e.id}`,
      })),
    });
  });
}
