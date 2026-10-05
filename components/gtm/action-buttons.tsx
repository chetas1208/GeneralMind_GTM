"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Radar, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={variant}
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await post(`/api/events/${eventId}/source`);
            if (!r.ok) setError(r.error ?? "Failed");
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Radar />}
        {label}
      </Button>
      {error && <span className="max-w-48 text-right text-[11px] text-destructive">{error}</span>}
    </div>
  );
}

export function DiscoverEventsButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await post("/api/events/discover");
            if (!r.ok) setError(r.error ?? "Failed");
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Search />}
        Discover events
      </Button>
    </div>
  );
}

export function RefreshIntelligenceButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await post("/api/intelligence/refresh");
            if (!r.ok) setMsg(r.error ?? "Failed");
            else {
              const d = r.data as { accounts?: number; verified?: number };
              setMsg(`Updated ${d.accounts ?? 0} accounts`);
            }
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        Refresh intelligence
      </Button>
    </div>
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
      await fetch(`/api/events/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
      router.refresh();
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
