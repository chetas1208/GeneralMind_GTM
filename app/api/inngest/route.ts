import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

// Inngest calls this endpoint to run each durable step; requests are verified with INNGEST_SIGNING_KEY.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
