"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Radar, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/ui/notifications";

async function post(url: string, body?: unknown): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as { error?: string }).error ?? `Request failed (${res.status})` };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

export function SourceLeadsButton({ eventId, disabled, label = "Source Leads", variant = "default" }: { eventId: string; disabled?: boolean; label?: string; variant?: "default" | "outline" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant={variant}
      disabled={disabled || pending}
      className="min-w-[9.5rem]"
      onClick={() =>
        start(async () => {
          const r = await post(`/api/events/${eventId}/source`);
          if (!r.ok) notify.error("Couldn't start research", r.error);
          else {
            notify.info("Research started", "We'll update this event as people and companies are found.");
            const runId = (r.data as { run?: { id?: string } })?.run?.id;
            if (runId) await fetch(`/api/runs/${runId}/tick`, { method: "POST" });
          }
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Radar />}
      {label}
    </Button>
  );
}

export function DiscoverEventsButton({
  running = false,
  runId,
  canStart = true,
}: {
  running?: boolean;
  runId?: string;
  canStart?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  function startDiscovery() {
    start(async () => {
      if (!canStart) {
        notify.warning("Discovery unavailable", "Search and model keys are required in this environment.");
        return;
      }
      const r = await post("/api/events/discover");
      if (!r.ok) {
        notify.error("Couldn't start discovery", r.error);
        return;
      }
      const d = r.data as { alreadyActive?: boolean; run?: { id?: string } };
      if (d.alreadyActive) notify.info("Already running", "Event discovery is already in progress.");
      else notify.info("Discovery started", "We'll notify you when new events are ready.");
      const id = d.run?.id;
      if (id) await fetch(`/api/runs/${id}/tick`, { method: "POST" });
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="outline"
        className="min-w-[11rem]"
        disabled={pending}
        aria-expanded={open}
        title={running ? "Market discovery is currently searching, verifying and ranking relevant events." : undefined}
        onClick={() => {
          if (running || pending) {
            setOpen((v) => !v);
            return;
          }
          startDiscovery();
        }}
      >
        {pending || running ? <Loader2 className="animate-spin" /> : <Search />}
        {running || pending ? "Discovery running" : "Discover events"}
      </Button>
      {open && running && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-border/70 bg-card p-3 text-xs shadow-lg">
          <p className="font-medium">Discovery in progress</p>
          <p className="mt-1 text-muted-foreground">Searching and verifying events.</p>
          <div className="mt-2 flex gap-3">
            <Link href={runId ? `/runs/${runId}` : "/pipeline"} className="text-sky-400 hover:underline" onClick={() => setOpen(false)}>
              View progress
            </Link>
            {runId && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() =>
                  start(async () => {
                    const r = await post(`/api/runs/${runId}/cancel`);
                    if (!r.ok) notify.error("Couldn't cancel", r.error);
                    else notify.info("Discovery stopping");
                    setOpen(false);
                    router.refresh();
                  })
                }
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function RefreshIntelligenceButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      className="min-w-[10.5rem]"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await post("/api/intelligence/refresh");
          if (!r.ok) notify.error("Couldn't refresh", r.error);
          else {
            const d = r.data as { accounts?: number };
            notify.success("Intelligence refreshed", `Updated ${d.accounts ?? 0} accounts.`);
          }
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : null}
      <span className="hidden sm:inline">Refresh intelligence</span>
      <span className="sm:hidden">Refresh</span>
    </Button>
  );
}

export function RefreshAccountButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await post(`/api/accounts/${companyId}/refresh`);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : "Refresh"}
    </Button>
  );
}

export function EventStatusButtons({ eventId, status }: { eventId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (next: string) =>
    start(async () => {
      try {
        const res = await fetch(`/api/events/${eventId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) notify.error("Couldn't update event", data.error);
        else router.refresh();
      } catch (e) {
        notify.error("Couldn't update event", e instanceof Error ? e.message : "Network error");
      }
    });
  return (
    <div className="flex items-center gap-1">
      {status !== "selected" && (
        <Button size="xs" variant="outline" disabled={pending} onClick={() => set("selected")}>
          Add to Radar
        </Button>
      )}
      {status !== "rejected" && (
        <Button size="xs" variant="ghost" disabled={pending} onClick={() => set("rejected")}>
          Dismiss
        </Button>
      )}
      {status === "selected" && (
        <Button size="xs" variant="ghost" disabled={pending} onClick={() => set("discovered")}>
          Remove
        </Button>
      )}
    </div>
  );
}
