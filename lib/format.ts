const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m: m - 1, day };
}

export function formatDateRange(start: string | null | undefined, end?: string | null): string {
  if (!start) return "Date TBC";
  const s = parts(start);
  if (!end || end === start) return `${MONTHS[s.m]} ${s.day}, ${s.y}`;
  const e = parts(end);
  if (s.y === e.y && s.m === e.m) return `${MONTHS[s.m]} ${s.day}–${e.day}, ${s.y}`;
  if (s.y === e.y) return `${MONTHS[s.m]} ${s.day} – ${MONTHS[e.m]} ${e.day}, ${s.y}`;
  return `${MONTHS[s.m]} ${s.day}, ${s.y} – ${MONTHS[e.m]} ${e.day}, ${e.y}`;
}

export function formatLocation(e: { city?: string | null; region?: string | null; country?: string | null; venue?: string | null }): string {
  const place = [e.city, e.region && e.region !== e.city ? e.region : null, e.country].filter(Boolean).join(", ");
  return place || "Location TBC";
}

export function formatRelative(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const t = typeof date === "string" ? Date.parse(date) : date.getTime();
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function humanize(s: string | null | undefined): string {
  return (s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function compactNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
