"use client";

import { GraphView } from "@/components/graph/graph-view";

export function EventGraphPanel({ eventId, runId }: { eventId: string; runId?: string }) {
  return <GraphView scope="event" entityId={eventId} runId={runId} minHeight={520} />;
}
