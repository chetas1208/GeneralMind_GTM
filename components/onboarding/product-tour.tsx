"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Joyride, STATUS, type EventData, type Step } from "react-joyride";

const KEY = "generalmind-tour-v1";

const STEPS: Step[] = [
  {
    target: "#tour-radar",
    content: "Start here. Radar tells you where GTM opportunity is rising or falling and what is driving the change.",
    title: "Radar",
  },
  {
    target: "#tour-momentum",
    content: "This tracks the strength of review-ready opportunities over time, weighted by priority and evidence. Look here first.",
    title: "Opportunity momentum",
  },
  {
    target: "#tour-drivers",
    content: "These are the largest contributors to the change. Open one to inspect the event behind it.",
    title: "Why it moved",
  },
  {
    target: "#tour-next",
    content: "One recommended next step — the strongest unreviewed opportunity, or an event that still needs research.",
    title: "What to do next",
  },
  {
    target: "#tour-events",
    content: "Every event explains why GeneralMind should care, which functions are there, and what we've already found.",
    title: "Upcoming events",
  },
  {
    target: "a[href='/leads']",
    content: "This is where you inspect decision-makers: company, role, evidence, score, and why now.",
    title: "Leads",
  },
  {
    target: "a[href='/pipeline']",
    content: "Approve or pass opportunities here. Approved ones can be pushed to CRM.",
    title: "Pipeline",
  },
];

export function ProductTour({ auto = false }: { auto?: boolean }) {
  const router = useRouter();
  const [run, setRun] = useState(false);
  const [welcome, setWelcome] = useState(() => auto && typeof window !== "undefined" && !localStorage.getItem(KEY));

  useEffect(() => {
    const onStart = () => setRun(true);
    window.addEventListener("gm-start-tour", onStart);
    return () => window.removeEventListener("gm-start-tour", onStart);
  }, [auto]);

  return (
    <>
      {welcome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md rounded-xl border bg-card p-5 shadow-xl">
            <h2 className="text-base font-semibold">Welcome to GeneralMind Radar</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Radar turns market signals into evidence-backed GTM opportunities. You will use Radar to see what is changing, Leads to review people, and Pipeline to track decisions.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                onClick={() => {
                  setWelcome(false);
                  setRun(true);
                }}
              >
                Take 60-second tour
              </button>
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground"
                onClick={() => {
                  localStorage.setItem(KEY, "dismissed");
                  setWelcome(false);
                }}
              >
                Explore myself
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
          if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
            localStorage.setItem(KEY, data.status);
            setRun(false);
            router.refresh();
          }
        }}
      />
    </>
  );
}

export function restartProductTour() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("gm-start-tour"));
}
