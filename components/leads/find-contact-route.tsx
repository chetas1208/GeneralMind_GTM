"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Outcome = { kind: "idle" } | { kind: "busy" } | { kind: "found" } | { kind: "none"; reasons: string[] } | { kind: "error"; message: string };

/** Looks up a public profile and attaches it only if it passes deterministic verification. */
export function FindContactRoute({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [state, setState] = useState<Outcome>({ kind: "idle" });

  async function run() {
    setState({ kind: "busy" });
    try {
      const res = await fetch(`/api/leads/${leadId}/contact-route`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setState({ kind: "error", message: body?.error ?? `Request failed (${res.status})` });
      if (body.status === "found") {
        setState({ kind: "found" });
        router.refresh();
      } else if (body.status === "not_found") setState({ kind: "none", reasons: body.reasons ?? [] });
      else setState({ kind: "none", reasons: [] });
    } catch {
      setState({ kind: "error", message: "Network error" });
    }
  }

  return (
    <div className="mt-2 space-y-1.5">
      <Button type="button" size="sm" variant="outline" disabled={state.kind === "busy"} onClick={run}>
        <Search /> {state.kind === "busy" ? "Searching public web…" : "Find verified profile"}
      </Button>
      {state.kind === "found" && <p className="text-[11px] text-emerald-400">Verified profile attached.</p>}
      {state.kind === "none" && (
        <p className="text-[11px] text-muted-foreground">
          No profile passed verification{state.reasons.length ? ` (${state.reasons.join("; ")})` : ""}. No contact route was invented.
        </p>
      )}
      {state.kind === "error" && <p className="text-[11px] text-destructive">{state.message}</p>}
    </div>
  );
}
