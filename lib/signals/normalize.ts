import { createHash } from "crypto";
import { normalizeUrl } from "@/lib/text";
import type { SignalCandidate, SignalType, VerifiedSignal } from "./types";

/** Stable dedupe key: same underlying announcement syndicated across sites counts once. */
export function signalDedupeKey(input: {
  companyId: string;
  type: SignalType;
  sourceUrl: string;
  title: string;
  occurredAt?: Date | null;
}): string {
  const url = normalizeUrl(input.sourceUrl) || input.sourceUrl.toLowerCase();
  const host = (() => {
    try {
      return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
    } catch {
      return url.slice(0, 80);
    }
  })();
  const day = input.occurredAt ? input.occurredAt.toISOString().slice(0, 10) : "";
  const titleKey = input.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 120);
  const raw = `${input.companyId}|${input.type}|${host}|${day}|${titleKey}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

export function attachDedupe(companyId: string, c: SignalCandidate): VerifiedSignal {
  return { ...c, dedupeKey: signalDedupeKey({ companyId, type: c.type, sourceUrl: c.sourceUrl, title: c.title, occurredAt: c.occurredAt }) };
}
