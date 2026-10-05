/**
 * Guard for URLs that would otherwise be fetched by this server or handed to a fetch proxy.
 * Firecrawl performs the HTTP GET on its own network; we still refuse non-public targets so a
 * scraped or typed URL cannot point that fetch at loopback, link-local, or RFC1918 space.
 * DNS rebinding (a public name that resolves to a private address) is not resolved here.
 */

function ipv4Blocked(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function publicFetchUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (host === "0.0.0.0" || host === "::1" || host === "metadata.google.internal") return null;
  if (host.includes(":") && (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd") || host.includes(":ffff:127.") || host.includes(":ffff:10.") || host.includes(":ffff:192.168.") || host.includes(":ffff:169.254."))) {
    return null;
  }
  if (ipv4Blocked(host)) return null;
  if (/^0x[0-9a-f]+$/i.test(host) || /^\d+$/.test(host)) return null;
  return url.toString();
}
