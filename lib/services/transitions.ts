import type { LeadStatus } from "@/lib/db/queries/leads";

/**
 * Lead review state machine. Enforced server-side in `lib/services/review.ts`.
 *
 *   discovered/enriching → qualified → needs_review → approved → hubspot_synced
 *                                          │              │            (terminal)
 *                                          └→ rejected ←──┘
 *   rejected → approved   explicit human reconsideration only
 *   approved → failed     CRM write failed; retry stays gated on the approval decision
 *
 * A rejected lead can never reach HubSpot without first being re-approved by a reviewer.
 */
export type ReviewAction = "approve" | "reject" | "push_hubspot";

const ALLOWED: Record<ReviewAction, readonly LeadStatus[]> = {
  approve: ["qualified", "needs_review", "approved", "rejected", "failed"],
  reject: ["qualified", "needs_review", "approved", "rejected", "failed"],
  push_hubspot: ["approved", "failed"],
};

export function canTransition(action: ReviewAction, from: LeadStatus): boolean {
  return ALLOWED[action].includes(from);
}

export function transitionError(action: ReviewAction, from: LeadStatus): string {
  if (from === "hubspot_synced") return "Lead is already synced to HubSpot; its review state is final.";
  if (action === "push_hubspot") {
    return from === "rejected"
      ? "Rejected leads cannot be pushed to HubSpot. Re-approve the lead first."
      : `Lead must be approved before it can be pushed to HubSpot (current status: ${from.replace(/_/g, " ")}).`;
  }
  return `A lead in "${from.replace(/_/g, " ")}" cannot be ${action === "approve" ? "approved" : "rejected"} yet — it has not reached review.`;
}
