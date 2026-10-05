"use client";

import { useEffect, useState } from "react";
import { Joyride, STATUS, type EventData, type Step } from "react-joyride";

const VERSION = "v1";
const KEY = "generalmind-tour-completed";

const STEPS: Step[] = [
  {
    target: "[data-tour='radar']",
    title: "1 / 7 · Start with Radar",
    content: "Radar shows where opportunity is building, what changed, and what deserves attention now.",
  },
  {
    target: "[data-tour='momentum']",
    title: "2 / 7 · Rising or falling",
    content: "Momentum tracks the strength of active opportunities using fit, evidence, urgency and freshness.",
  },
  {
    target: "[data-tour='drivers']",
    title: "3 / 7 · What moved the market",
    content: "These drivers explain why momentum changed. Open one to inspect the underlying event.",
  },
  {
    target: "[data-tour='events']",
    title: "4 / 7 · Find the right moments",
    content: "Events are ranked by GeneralMind relevance. Each one explains why it matters and what we've already found.",
  },
  {
    target: "[data-tour='leads']",
    title: "5 / 7 · People worth contacting",
    content: "Every opportunity includes the person, company, timing, score and supporting evidence. You do not need CRM access to understand it.",
  },
  {
    target: "[data-tour='trace']",
    title: "6 / 7 · Interrogate the recommendation",
    content: "Evidence shows what is verified. Trace explains how the signals, account, person and opportunity connect.",
  },
  {
    target: "[data-tour='pipeline']",
    title: "7 / 7 · Make the decision",
    content: "Approve, pass, add notes, and push approved opportunities to CRM. That's the complete workflow.",
  },
];

export function ProductTour({ auto = false }: { auto?: boolean }) {
  const [run, setRun] = useState(false);
  const [welcome, setWelcome] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(KEY);
    const version = localStorage.getItem("generalmind-tour-version");
    if (auto && (done !== "1" || version !== VERSION)) {
      const id = window.setTimeout(() => setWelcome(true), 400);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [auto]);

  useEffect(() => {
    const onStart = () => {
      setWelcome(false);
      setRun(true);
    };
    window.addEventListener("gm-start-tour", onStart);
    return () => window.removeEventListener("gm-start-tour", onStart);
  }, []);

  function finish() {
    localStorage.setItem(KEY, "1");
    localStorage.setItem("generalmind-tour-version", VERSION);
    setRun(false);
    setWelcome(false);
  }

  return (
    <>
      {welcome && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl border border-border/70 bg-card p-5 shadow-2xl">
            <h2 className="text-base font-semibold">Welcome to GeneralMind Radar</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Find the right market moments, understand why they matter, and turn them into reviewable opportunities.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground" onClick={() => { setWelcome(false); setRun(true); }}>
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
        steps={STEPS}
        run={run}
        continuous
        scrollToFirstStep
        options={{ buttons: ["back", "primary", "skip"] }}
        onEvent={(data: EventData) => {
          if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) finish();
        }}
      />
    </>
  );
}

export function restartProductTour() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("gm-start-tour"));
}
