"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { EVENTS, Joyride, STATUS, type EventData, type Step } from "react-joyride";

const VERSION = "v2";
const KEY = "generalmind-tour-completed";
const PENDING = "gm-tour-pending";

const STEPS: Array<Step & { label: string }> = [
  {
    target: "[data-tour='radar']",
    label: "Start with Radar",
    content: "Radar shows where opportunity is building, what changed, and what deserves attention now.",
    placement: "bottom",
  },
  {
    target: "[data-tour='momentum']",
    label: "Rising or falling",
    content: "Momentum tracks the strength of active opportunities using fit, evidence, urgency and freshness.",
    placement: "bottom",
  },
  {
    target: "[data-tour='drivers']",
    label: "What moved the market",
    content: "These drivers explain why momentum changed. Open one to inspect the underlying event.",
    placement: "bottom",
  },
  {
    target: "[data-tour='events']",
    label: "Find the right moments",
    content: "Events are ranked by relevance. Each one explains why it matters and what has already been found.",
    placement: "top",
  },
  {
    target: "[data-tour='trace']",
    label: "Open a person to see why",
    content: "Open a lead to see the evidence and the short trace connecting the account, person, and event.",
    placement: "top",
  },
  {
    target: "[data-tour='leads']",
    label: "People worth contacting",
    content: "Leads is the review queue: person, company, priority, and evidence confidence.",
    placement: "right",
    isFixed: true,
  },
  {
    target: "[data-tour='pipeline']",
    label: "Make the decision",
    content: "Approve, pass, add notes, and push approved opportunities to CRM.",
    placement: "right",
    isFixed: true,
  },
];

function visibleSteps(): Step[] {
  const found = STEPS.filter((step) => {
    if (typeof step.target !== "string") return false;
    const el = document.querySelector(step.target);
    if (!(el instanceof HTMLElement)) return false;
    const box = el.getBoundingClientRect();
    if (box.width < 12 || box.height < 12) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  });
  return found.map((step, index) => ({
    ...step,
    title: `${index + 1} / ${found.length} · ${step.label}`,
    skipBeacon: true,
  }));
}

export function ProductTour({ auto = false }: { auto?: boolean }) {
  const pathname = usePathname();
  const [run, setRun] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!auto) return;
    const done = localStorage.getItem(KEY);
    const version = localStorage.getItem("generalmind-tour-version");
    if (done === "1" && version === VERSION) return;
    const id = window.setTimeout(() => setWelcome(true), 400);
    return () => window.clearTimeout(id);
  }, [auto]);

  useEffect(() => {
    if (pathname !== "/radar" || sessionStorage.getItem(PENDING) !== "1") return;
    sessionStorage.removeItem(PENDING);
    const id = window.setTimeout(() => begin(), 450);
    return () => window.clearTimeout(id);
  }, [pathname]);

  useEffect(() => {
    const onStart = () => begin();
    window.addEventListener("gm-start-tour", onStart);
    return () => window.removeEventListener("gm-start-tour", onStart);
  }, []);

  function begin() {
    const next = visibleSteps();
    if (!next.length) return;
    setWelcome(false);
    setSteps(next);
    setRun(false);
    setNonce((n) => n + 1);
  }

  useEffect(() => {
    if (nonce === 0 || steps.length === 0) return;
    const id = window.setTimeout(() => setRun(true), 60);
    return () => window.clearTimeout(id);
  }, [nonce, steps]);

  function finish() {
    localStorage.setItem(KEY, "1");
    localStorage.setItem("generalmind-tour-version", VERSION);
    setRun(false);
    setWelcome(false);
  }

  return (
    <>
      {welcome && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl border border-border/70 bg-card p-5 shadow-2xl">
            <h2 className="text-base font-semibold">Welcome to GeneralMind Radar</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Find the right market moments, understand why they matter, and turn them into reviewable opportunities.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground" onClick={begin}>
                Take the 60-second tour
              </button>
              <button type="button" className="rounded-md px-3 py-1.5 text-sm text-muted-foreground" onClick={finish}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
      <Joyride
        key={nonce}
        steps={steps}
        run={run && steps.length > 0}
        continuous
        scrollToFirstStep
        options={{
          skipBeacon: true,
          blockTargetInteraction: true,
          overlayClickAction: false,
          buttons: ["back", "primary", "skip"],
          showProgress: true,
          zIndex: 10000,
          width: 320,
          backgroundColor: "var(--card)",
          textColor: "var(--foreground)",
          primaryColor: "var(--primary)",
          arrowColor: "var(--card)",
          overlayColor: "rgba(0,0,0,0.62)",
          spotlightRadius: 8,
          spotlightPadding: 6,
        }}
        styles={{
          tooltip: { borderRadius: 12, border: "1px solid var(--border)" },
          tooltipContent: { padding: "4px 0 0", fontSize: 14, lineHeight: 1.45 },
          buttonPrimary: { cursor: "pointer", borderRadius: 8, color: "var(--primary-foreground)" },
          buttonBack: { cursor: "pointer" },
          buttonSkip: { cursor: "pointer" },
        }}
        locale={{ last: "Done" }}
        onEvent={(data: EventData) => {
          if (data.type === EVENTS.TOUR_END && (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED)) finish();
        }}
      />
    </>
  );
}

export function restartProductTour() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("gm-start-tour"));
}
