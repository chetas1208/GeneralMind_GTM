import { z } from "zod";
import { handle, json } from "@/lib/api";
import { requireReviewer } from "@/lib/auth";
import { buildGraph } from "@/lib/graph/builder";
import { layoutGraph } from "@/lib/graph/layout";

const querySchema = z.object({
  scope: z.enum(["opportunity", "event", "company", "market"]),
  entityId: z.string().uuid().optional(),
  runId: z.string().uuid().optional(),
  depth: z.coerce.number().int().min(1).max(4).optional(),
  minConfidence: z.coerce.number().int().min(0).max(100).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  layout: z.enum(["TB", "LR"]).optional(),
});

/** Read-only intelligence graph projection from Neon (auth enforced by proxy). */
export async function GET(request: Request) {
  return handle(async () => {
    await requireReviewer(request);
    const url = new URL(request.url);
    const q = querySchema.parse(Object.fromEntries(url.searchParams.entries()));
    if (q.scope !== "market" && !q.entityId) {
      return json({ error: "entityId is required for this scope" }, { status: 400 });
    }
    const model = await buildGraph({
      scope: q.scope,
      entityId: q.entityId,
      runId: q.runId,
      depth: q.depth,
      minConfidence: q.minConfidence,
      minScore: q.minScore,
    });
    if (!model) return json({ error: "Not found" }, { status: 404 });
    const layouted = layoutGraph(model, q.layout ?? "TB");
    return json(layouted);
  });
}
