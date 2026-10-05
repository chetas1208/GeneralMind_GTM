import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { HttpError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { hubspotSyncs, people, reviewActions } from "@/lib/db/schema";
import { getLeadDetail, updateLead, type LeadDetail } from "@/lib/db/queries/leads";
import { classifyTitle } from "@/lib/scoring/persona-score";
import { requireEnv } from "@/lib/env";
import { IntegrationError } from "@/lib/http";
import { createLogger } from "@/lib/logger";
import { syncLeadToHubspot } from "@/lib/integrations/hubspot/sync";
import { ATTENDANCE_LABEL } from "@/lib/scoring/config";
import { canTransition, transitionError, type ReviewAction } from "./transitions";

const log = createLogger("review");

async function record(eventLeadId: string, action: (typeof reviewActions.$inferInsert)["action"], reason?: string | null, notes?: string | null) {
  await getDb().insert(reviewActions).values({ eventLeadId, action, reason: reason ?? null, notes: notes ?? null });
}

async function mustGet(id: string): Promise<LeadDetail> {
  const d = await getLeadDetail(id);
  if (!d) throw new HttpError(404, "Lead not found");
  return d;
}

/** Last review decision wins; used to gate CRM writes. */
export function isApproved(d: Pick<LeadDetail, "reviews">): boolean {
  const decision = d.reviews.find((r) => r.action === "approve" || r.action === "reject");
  return decision?.action === "approve";
}

/** Throws 409 unless the action is legal from the lead's current status. A "failed" lead needs prior review history. */
function assertTransition(action: ReviewAction, d: LeadDetail) {
  const from = d.lead.status;
  const failedWithoutReview = from === "failed" && !d.reviews.some((r) => r.action === "approve" || r.action === "reject");
  if (!canTransition(action, from) || failedWithoutReview) throw new HttpError(409, transitionError(action, from));
}

export async function approveLead(id: string, notes?: string | null) {
  const d = await mustGet(id);
  assertTransition("approve", d);
  const updated = await updateLead(id, { status: "approved" }, { expectedStatus: d.lead.status });
  if (!updated) {
    const again = await mustGet(id);
    throw new HttpError(409, transitionError("approve", again.lead.status));
  }
  await record(id, "approve", null, notes);
  log.info("lead approved", { leadId: id, from: d.lead.status });
  return mustGet(id);
}

export async function rejectLead(id: string, reason: string, notes?: string | null) {
  const d = await mustGet(id);
  assertTransition("reject", d);
  const updated = await updateLead(id, { status: "rejected" }, { expectedStatus: d.lead.status });
  if (!updated) {
    const again = await mustGet(id);
    throw new HttpError(409, transitionError("reject", again.lead.status));
  }
  await record(id, "reject", reason, notes);
  log.info("lead rejected", { leadId: id, reason, from: d.lead.status });
  return mustGet(id);
}

export async function editLead(id: string, patch: { title?: string | null; email?: string | null; notes?: string | null }) {
  const d = await mustGet(id);
  const changes: string[] = [];
  const set: Partial<typeof people.$inferInsert> = {};
  if (patch.title && patch.title !== d.person.title) {
    const cls = classifyTitle(patch.title);
    set.title = patch.title;
    if (!cls.inconclusive) set.persona = cls.persona;
    if (cls.seniority !== "unknown") set.seniority = cls.seniority;
    changes.push(`title: "${d.person.title ?? ""}" → "${patch.title}"`);
  }
  if (patch.email && patch.email.toLowerCase() !== d.person.email) {
    set.email = patch.email.toLowerCase();
    set.emailStatus = "manual";
    changes.push("email set manually");
  }
  if (changes.length === 0 && !patch.notes) throw new HttpError(400, "Nothing to change");
  // Manual edits intentionally overwrite: human knowledge outranks enrichment.
  if (Object.keys(set).length) await getDb().update(people).set({ ...set, updatedAt: new Date() }).where(eq(people.id, d.person.id));
  await record(id, "edit", changes.join("; ") || null, patch.notes);
  return mustGet(id);
}

export type HubspotPushResult = {
  status: "synced" | "already_synced";
  contactId: string;
  companyId: string | null;
  /** Human-readable sync log for the reviewer (no secrets). */
  steps: string[];
};

/**
 * Human-gated CRM write. Preconditions: the latest review decision is "approve".
 * Idempotent: previous HubSpot IDs are reused; an already-synced lead returns immediately.
 */
export async function pushLeadToHubspot(id: string): Promise<HubspotPushResult> {
  requireEnv("HUBSPOT_ACCESS_TOKEN"); // clear ConfigError before touching state
  const d = await mustGet(id);
  const latestSync = d.syncs[0];

  if (!isApproved(d)) throw new HttpError(409, "Lead must be approved by a human reviewer before it can be pushed to HubSpot");
  if (d.lead.status === "hubspot_synced" && latestSync?.status === "synced" && latestSync.hubspotContactId) {
    return {
      status: "already_synced",
      contactId: latestSync.hubspotContactId,
      companyId: latestSync.hubspotCompanyId,
      steps: ["Lead already synced — no duplicate contact or company was created."],
    };
  }
  if (!canTransition("push_hubspot", d.lead.status)) throw new HttpError(409, transitionError("push_hubspot", d.lead.status));
  if (latestSync?.status === "syncing" && Date.now() - latestSync.createdAt.getTime() < 2 * 60_000) {
    throw new HttpError(409, "A HubSpot sync for this lead is already in progress");
  }

  const db = getDb();
  const previous = d.syncs.find((s) => s.hubspotContactId || s.hubspotCompanyId);
  const staleBefore = new Date(Date.now() - 2 * 60_000);
  await db
    .update(hubspotSyncs)
    .set({ status: "failed", error: "Sync lock expired" })
    .where(and(eq(hubspotSyncs.eventLeadId, id), eq(hubspotSyncs.status, "syncing"), lt(hubspotSyncs.createdAt, staleBefore)));
  let row: typeof hubspotSyncs.$inferSelect;
  try {
    const inserted = await db.insert(hubspotSyncs).values({ eventLeadId: id, status: "syncing" }).returning();
    if (!inserted[0]) throw new HttpError(500, "Internal server error");
    row = inserted[0];
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("23505") || /duplicate key|hubspot_syncs_one_syncing_uq/i.test(message)) {
      throw new HttpError(409, "A HubSpot sync for this lead is already in progress");
    }
    throw e;
  }

  try {
    const result = await syncLeadToHubspot({
      previous: { contactId: previous?.hubspotContactId, companyId: previous?.hubspotCompanyId },
      company: d.company
        ? {
            name: d.company.name,
            domain: d.company.domain,
            employeeCount: d.company.employeeCount,
            country: d.company.country,
            city: d.company.headquarters?.split(",")[0]?.trim() || null,
            description: d.company.description,
            linkedinUrl: d.company.linkedinUrl,
          }
        : null,
      contact: {
        email: d.person.email,
        firstName: d.person.firstName,
        lastName: d.person.lastName,
        jobTitle: d.person.title,
        companyName: d.company?.name,
        linkedinUrl: d.person.linkedinUrl,
        extra: {
          generalmind_source_event: d.event.name,
          generalmind_lead_score: String(d.lead.totalScore),
          generalmind_attendance: ATTENDANCE_LABEL[d.lead.attendanceType],
          generalmind_attendance_confidence: String(d.lead.attendanceConfidence),
        },
      },
    });
    await db
      .update(hubspotSyncs)
      .set({ status: "synced", hubspotContactId: result.contactId, hubspotCompanyId: result.companyId, syncedAt: new Date(), error: null })
      .where(eq(hubspotSyncs.id, row.id));
    await updateLead(id, { status: "hubspot_synced" });
    const steps = [
      result.companyId
        ? result.companyCreated
          ? `Company created in HubSpot (${result.companyId})`
          : `Company matched / updated (${result.companyId})`
        : "No company record (lead had no company domain)",
      result.contactCreated ? `Contact created (${result.contactId})` : `Contact matched / updated (${result.contactId})`,
      result.associated ? "Contact associated with company" : "Association skipped (no company)",
      result.usedExtraProperties ? "GeneralMind custom properties written" : "Standard CRM properties only (custom properties not in portal)",
      "HubSpot sync complete",
    ];
    await record(id, "push_hubspot", null, steps.join(" · "));
    return { status: "synced", contactId: result.contactId, companyId: result.companyId, steps };
  } catch (e) {
    const message = e instanceof IntegrationError || e instanceof Error ? e.message : String(e);
    await db.update(hubspotSyncs).set({ status: "failed", error: message.slice(0, 1_000) }).where(eq(hubspotSyncs.id, row.id));
    await updateLead(id, { status: "failed" });
    log.error("hubspot sync failed", { leadId: id, error: message });
    throw e;
  }
}

