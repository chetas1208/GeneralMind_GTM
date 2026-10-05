import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadDetailView } from "@/components/leads/lead-detail-view";
import { getLeadDetail } from "@/lib/db/queries/leads";
import { isConfigured } from "@/lib/env";
import { isApproved } from "@/lib/services/review";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/leads/[id]">): Promise<Metadata> {
  const { id } = await params;
  const d = /^[0-9a-f-]{36}$/i.test(id) ? await getLeadDetail(id) : null;
  return { title: d ? d.person.fullName : "Lead" };
}

/** Shareable full-page lead view (same intelligence as the peek panel). */
export default async function LeadPage({ params }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getLeadDetail(id);
  if (!d) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/leads" className="text-xs text-muted-foreground hover:text-foreground">
        ← Back to leads
      </Link>
      <LeadDetailView detail={JSON.parse(JSON.stringify(d))} crmConfigured={isConfigured("HUBSPOT_ACCESS_TOKEN")} approved={isApproved(d)} />
    </div>
  );
}
