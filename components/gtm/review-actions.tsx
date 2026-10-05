"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CloudUpload, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/gtm/badges";
import { formatRelative } from "@/lib/format";

async function call(url: string, method: "POST" | "PATCH", body?: unknown): Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as { error?: string }).error ?? `Request failed (${res.status})` };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

/** Compact approve/reject for table rows. */
export function QuickReviewButtons({ leadId, status }: { leadId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const locked = status === "hubspot_synced";
  const run = (path: string, body?: unknown) =>
    start(async () => {
      setError(null);
      const r = await call(`/api/leads/${leadId}/${path}`, "POST", body);
      if (!r.ok) setError(r.error ?? "Failed");
      router.refresh();
    });
  if (locked) return null;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <Button size="icon-xs" variant="outline" aria-label="Approve" title="Approve" disabled={pending || status === "approved"} onClick={() => run("approve")}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
        </Button>
        <Button size="icon-xs" variant="outline" aria-label="Reject" title="Reject (not ICP)" disabled={pending || status === "rejected"} onClick={() => run("reject", { reason: "not_icp" })}>
          <X />
        </Button>
      </div>
      {error && <span className="max-w-40 text-right text-[11px] text-destructive">{error}</span>}
    </div>
  );
}

type SyncDto = { status: string; hubspotContactId: string | null; hubspotCompanyId: string | null; error: string | null; syncedAt: string | null; createdAt: string } | null;

const REJECT_REASONS = [
  ["not_icp", "Not ICP"],
  ["wrong_persona", "Wrong persona"],
  ["weak_evidence", "Weak evidence"],
  ["already_in_crm", "Already in CRM"],
  ["bad_timing", "Bad timing"],
  ["other", "Other"],
] as const;

export function ReviewPanel({
  leadId,
  status,
  approved,
  sync,
  hubspotConfigured,
  person,
}: {
  leadId: string;
  status: string;
  approved: boolean;
  sync: SyncDto;
  hubspotConfigured: boolean;
  person: { title: string | null; email: string | null };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState<string>("not_icp");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const synced = status === "hubspot_synced" && sync?.status === "synced";

  const act = (label: string, fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      setError(null);
      setMessage(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? `${label} failed`);
      else {
        setMessage(success);
        setNotes("");
      }
      router.refresh();
    });

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">Review</h3>

      {!synced && (
        <>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Review notes (optional)" rows={2} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={pending || status === "approved"} onClick={() => act("Approve", () => call(`/api/leads/${leadId}/approve`, "POST", { notes: notes || undefined }), "Approved")}>
              <Check /> Approve
            </Button>
            <Button size="sm" variant="outline" disabled={pending || status === "rejected"} onClick={() => act("Reject", () => call(`/api/leads/${leadId}/reject`, "POST", { reason, notes: notes || undefined }), "Rejected")}>
              <X /> Reject
            </Button>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-7 rounded-lg border bg-card px-2 text-xs" aria-label="Rejection reason">
              {REJECT_REASONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div className="border-t pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">CRM</span>
          {synced ? (
            <StatusPill status="hubspot_synced" label="Synced" />
          ) : sync?.status === "failed" ? (
            <StatusPill status="failed" label="Sync failed" />
          ) : sync?.status === "syncing" ? (
            <StatusPill status="running" label="Syncing" />
          ) : (
            <StatusPill status="discovered" label="Not synced" />
          )}
        </div>
        {synced && sync ? (
          <p className="text-xs text-muted-foreground">Synced {formatRelative(sync.syncedAt)}</p>
        ) : (
          <>
            {sync?.status === "failed" && sync.error && <p className="mb-2 rounded-md bg-red-50 p-2 text-xs text-red-800">{sync.error}</p>}
            <Button
              size="sm"
              variant={approved ? "default" : "outline"}
              disabled={pending || !approved || !hubspotConfigured}
              onClick={() =>
                start(async () => {
                  setError(null);
                  setMessage(null);
                  const r = await call(`/api/leads/${leadId}/hubspot`, "POST");
                  if (!r.ok) setError(r.error ?? "CRM push failed");
                  else {
                    const steps = r.data?.steps;
                    setMessage(Array.isArray(steps) ? (steps as string[]).join("\n") : "Synced to CRM");
                    router.refresh();
                  }
                })
              }
              title={!approved ? "Approve the lead first" : !hubspotConfigured ? "HUBSPOT_ACCESS_TOKEN is not configured" : undefined}
            >
              {pending ? <Loader2 className="animate-spin" /> : <CloudUpload />}
              {sync?.status === "failed" ? "Retry push to CRM" : "Push to CRM"}
            </Button>
            {message && <pre className="mb-2 whitespace-pre-wrap rounded-md bg-emerald-50 p-2 text-[11px] text-emerald-900">{message}</pre>}
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {!hubspotConfigured ? "CRM sync is not configured for this workspace." : approved ? "Creates or updates the company and contact in your CRM." : "Only approved leads can be pushed."}
            </p>
          </>
        )}
      </div>

      <div className="border-t pt-3">
        {editing ? (
          <EditFields leadId={leadId} person={person} onDone={() => { setEditing(false); router.refresh(); }} />
        ) : (
          <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil /> Correct title / email
          </Button>
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 p-2 text-xs text-red-800">{error}</p>}
      {message && <p className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-800">{message}</p>}
    </div>
  );
}

function EditFields({ leadId, person, onDone }: { leadId: string; person: { title: string | null; email: string | null }; onDone: () => void }) {
  const [title, setTitle] = useState(person.title ?? "");
  const [email, setEmail] = useState(person.email ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
      <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Work email" type="email" />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button
          size="xs"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await call(`/api/leads/${leadId}`, "PATCH", { title: title || undefined, email: email || undefined });
              if (!r.ok) setError(r.error ?? "Failed");
              else onDone();
            })
          }
        >
          Save
        </Button>
        <Button size="xs" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
