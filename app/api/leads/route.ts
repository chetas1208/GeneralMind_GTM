import { z } from "zod";
import { handle, json } from "@/lib/api";
import { requireReviewer } from "@/lib/auth";
import { listLeads } from "@/lib/db/queries/leads";

const querySchema = z.object({
  event: z.string().uuid().optional(),
  status: z.string().optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  minAttendance: z.coerce.number().int().min(0).max(100).optional(),
  persona: z.string().max(60).optional(),
  industry: z.string().max(60).optional(),
  q: z.string().max(100).optional(),
  sort: z.enum(["score", "attendance", "company_fit", "newest"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const STATUSES = ["discovered", "enriching", "qualified", "needs_review", "approved", "rejected", "hubspot_synced", "failed"] as const;

export async function GET(request: Request) {
  return handle(async () => {
    await requireReviewer(request);
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const q = querySchema.parse(raw);
    const statuses = q.status
      ? q.status
          .split(",")
          .filter((s): s is (typeof STATUSES)[number] => (STATUSES as readonly string[]).includes(s))
      : undefined;
    const result = await listLeads({ eventId: q.event, statuses, minScore: q.minScore, minAttendance: q.minAttendance, persona: q.persona, industry: q.industry, q: q.q, sort: q.sort, limit: q.limit, offset: q.offset });
    return json(result);
  });
}
