import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CircleDashed, AlertTriangle, XCircle } from "lucide-react";
import { getIntegrationHealth, SERVICE_STATUS_LABEL, type ServiceStatus } from "@/lib/integrations/health";
import { signalStats } from "@/lib/db/queries/signals";
import { getEnv } from "@/lib/env";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "System" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const statusMeta: Record<ServiceStatus, { icon: typeof CheckCircle2; className: string }> = {
  ok: { icon: CheckCircle2, className: "text-success" },
  degraded: { icon: AlertTriangle, className: "text-warning" },
  error: { icon: XCircle, className: "text-destructive" },
  unconfigured: { icon: CircleDashed, className: "text-muted-foreground" },
  invalid_credentials: { icon: XCircle, className: "text-destructive" },
  rate_limited: { icon: AlertTriangle, className: "text-warning" },
};

export default async function SystemPage({ searchParams }: PageProps<"/system">) {
  const sp = await searchParams;
  const fresh = sp.fresh === "1";
  const env = getEnv();
  const [services, sig] = await Promise.all([getIntegrationHealth({ fresh }), signalStats().catch(() => null)]);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">System diagnostics</h1>
          <p className="text-muted-foreground">
            Live connectivity checks for every integration. Credentials are never displayed.
          </p>
        </div>
        <Link
          href="/system?fresh=1"
          className="rounded-md border bg-card px-3 py-1.5 text-[13px] font-medium hover:bg-accent"
        >
          Re-run checks
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-left">
          <thead className="border-b bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Service</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="hidden px-4 py-2 font-medium md:table-cell">Detail</th>
              <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Latency</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {services.map((s) => {
              const meta = statusMeta[s.status];
              const Icon = meta.icon;
              return (
                <tr key={s.id} className="align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.label}</div>
                    <div className="text-xs text-muted-foreground">{s.purpose}</div>
                    <div className="mt-1 text-xs md:hidden">{s.detail}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1.5 font-medium", meta.className)}>
                      <Icon className="size-4" />
                      {SERVICE_STATUS_LABEL[s.status]}
                    </span>
                  </td>
                  <td className="hidden max-w-xl px-4 py-3 text-muted-foreground md:table-cell">{s.detail}</td>
                  <td className="hidden px-4 py-3 text-right font-mono text-xs text-muted-foreground sm:table-cell">
                    {s.latencyMs != null ? `${s.latencyMs} ms` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sig && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Signal engine</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-mono">{sig.total}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Verified</dt>
              <dd className="font-mono">{sig.verified}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Rejected</dt>
              <dd className="font-mono">{sig.rejected}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Positive</dt>
              <dd className="font-mono">{sig.positive}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Negative</dt>
              <dd className="font-mono">{sig.negative}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">Model configuration</h2>
        <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-[13px]">
          <dt className="text-muted-foreground">Model</dt>
          <dd className="font-mono text-xs">{env.MODEL_NAME}</dd>
          <dt className="text-muted-foreground">Base URL</dt>
          <dd className="font-mono text-xs">{env.MODEL_BASE_URL}</dd>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Swap models by changing <code className="font-mono">MODEL_NAME</code> /{" "}
          <code className="font-mono">MODEL_BASE_URL</code>; no business logic depends on the provider.
        </p>
      </div>
    </div>
  );
}
