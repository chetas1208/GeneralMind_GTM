import { eventType, staticSchema } from "inngest";

/**
 * Typed application events. Payloads carry identifiers only (never secrets, never scraped
 * content): Neon is the source of truth and each workflow re-reads what it needs.
 */
export const sourceEventRequested = eventType("gtm/event.source.requested", {
  schema: staticSchema<{ runId: string; eventId: string; requestedBy: string; dispatchId: string; idempotencyKey: string }>(),
});

export const eventsDiscoveryRequested = eventType("gtm/events.discovery.requested", {
  schema: staticSchema<{ runId: string; requestedBy: string; dispatchId: string; idempotencyKey: string }>(),
});

export const eventAssessRequested = eventType("gtm/event.assess.requested", {
  schema: staticSchema<{ eventId: string; requestedBy: string }>(),
});

/** Reserved contracts for workflows that are designed but not built in this release. */
export const EVENT_NAMES = {
  sourceEvent: sourceEventRequested.name,
  discoverEvents: eventsDiscoveryRequested.name,
  assessEvent: eventAssessRequested.name,
} as const;
