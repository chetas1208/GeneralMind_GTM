import { z } from "zod";
import { handle, json } from "@/lib/api";
import { requireReviewer } from "@/lib/auth";
import { buildGraph } from "@/lib/graph/builder";
import { diffGraphs } from "@/lib/graph/delta";
import { layoutGraph } from "@/lib/graph/layout";
import type { GraphViewModel } from "@/lib/graph/types";

const bodySchema = z.object({
  scope: z.enum(["opportunity", "event", "company", "market"]),
  entityId: z.string().uuid().optional(),
  runId: z.string().uuid().optional(),
  previous: z.object({
    scope: z.enum(["opportunity", "event", "company", "market"]),
    nodes: z.array(z.unknown()),
    edges: z.array(z.unknown()),
    generatedAt: z.string(),
    stats: z.object({ nodeCount: z.number(), edgeCount: z.number() }),
  }),
});

/** Incremental graph updates while a source run is active (poll every 2–4s). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireReviewer(request);
    const { scope, entityId, runId, previous } = bodySchema.parse(await request.json());
    if (scope !== "market" && !entityId) return json({ error: "entityId required" }, { status: 400 });
    const next = await buildGraph({ scope, entityId, runId });
    if (!next) return json({ error: "Not found" }, { status: 404 });
    const delta = diffGraphs(previous as GraphViewModel, next);
    const snapshot = layoutGraph(next);
    return json({ delta, snapshot });
  });
}
