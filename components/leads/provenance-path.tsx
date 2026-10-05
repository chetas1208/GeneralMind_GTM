import { buildProvenancePath } from "@/lib/intelligence/evidence/provenance";
import { evidenceSourceLabel } from "@/lib/gtm-present";

export function ProvenancePath({
  personName,
  personTitle,
  companyName,
  eventName,
  attendanceType,
  topEvidenceType,
}: {
  personName: string;
  personTitle: string | null;
  companyName: string | null;
  eventName: string;
  attendanceType: string;
  topEvidenceType?: string | null;
}) {
  const steps = buildProvenancePath({
    personName,
    personTitle,
    companyName,
    eventName,
    attendanceType,
    strongestEvidenceLabel: topEvidenceType ? evidenceSourceLabel(topEvidenceType) : null,
  });

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 px-3 py-2.5 text-[12px]">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Provenance</p>
      <ol className="space-y-1">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2">
            {i > 0 && <span className="mt-0.5 text-muted-foreground">↓</span>}
            <div>
              <span className="font-medium">{s.label}</span>
              {s.detail && <span className="text-muted-foreground"> · {s.detail}</span>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
