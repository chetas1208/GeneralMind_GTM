import "server-only";
import type { NextAction } from "./types";

type Opp = { id: string; priorityScore: number; personName: string; companyName: string | null; title: string | null };
type Ev = { id: string; name: string; leadCount: number; status: string };

export function pickNextAction(opps: Opp[], events: Ev[]): NextAction {
  const top = [...opps].sort((a, b) => b.priorityScore - a.priorityScore)[0];
  if (top) {
    return {
      title: `Review ${top.personName}`,
      detail: `${top.title ?? "Decision-maker"}${top.companyName ? ` · ${top.companyName}` : ""} · priority ${top.priorityScore}`,
      href: `/leads?lead=${top.id}`,
      cta: "Review opportunity",
    };
  }
  const unsourced = events.find((e) => e.leadCount === 0);
  if (unsourced) {
    return {
      title: `Research ${unsourced.name}`,
      detail: "This event is on Radar but has not been researched yet.",
      href: `/events/${unsourced.id}`,
      cta: "Open event",
    };
  }
  return {
    title: "Discover events",
    detail: "Start by finding upcoming events that match GeneralMind.",
    href: "/radar",
    cta: "Discover events",
  };
}
