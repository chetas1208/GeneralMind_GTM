import "server-only";
import { chat } from "@/lib/ai/client";
import { untrustedBlock } from "@/lib/ai/untrusted";
import { isConfigured } from "@/lib/env";
import type { MomentumDriver } from "./types";

const cache = new Map<string, { text: string; at: number }>();

function fallback(drivers: MomentumDriver[], deltaPct: number | null): string {
  const top = drivers[0];
  if (!top) return "No new review-ready opportunities moved momentum in this window.";
  const change = deltaPct == null ? "Momentum reflects" : `Momentum ${deltaPct >= 0 ? "rose" : "fell"} ${Math.abs(deltaPct)}% primarily because`;
  return `${change} ${top.title} ${top.detail.charAt(0).toLowerCase()}${top.detail.slice(1)}`;
}

/** Summarize only the computed drivers. Falls back to that arithmetic if the model is unavailable. */
export async function explainDrivers(drivers: MomentumDriver[], deltaPct: number | null): Promise<string> {
  const plain = fallback(drivers, deltaPct);
  if (!drivers.length || !isConfigured("NVIDIA_API_KEY")) return plain;
  const key = `${deltaPct}|${drivers.map((d) => `${d.title}:${d.contribution}`).join("|")}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.text;
  try {
    const facts = drivers.map((d) => `${d.direction === "up" ? "+" : "-"}${d.contribution} ${d.title}: ${d.detail}`).join("\n");
    const res = await Promise.race([
      chat({
        system:
          "Explain a GTM metric change in at most two sentences. Use only the contributors provided. Do not invent events, counts, or business outcomes.",
        user: untrustedBlock("metric contributors", `Change versus the previous period: ${deltaPct == null ? "not enough history" : `${deltaPct}%`}.\nContributors:\n${facts}`),
        maxTokens: 160,
        temperature: 0.2,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000)),
    ]);
    if (!res?.text) return plain;
    const text = res.text.replace(/\s+/g, " ").trim().slice(0, 420);
    if (text) {
      cache.set(key, { text, at: Date.now() });
      return text;
    }
  } catch {
    /* model unavailable — arithmetic sentence is enough */
  }
  return plain;
}
