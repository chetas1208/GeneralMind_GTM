import { MAX } from "./config";
import {
  classifyTitle,
  decisionInfluencePoints,
  FUNCTION_POINTS,
  SENIORITY_POINTS,
  workflowProximityPoints,
} from "./personas";
import type { Persona, ScoreFactor, ScoreSection, Seniority } from "./types";

export type PersonaScoreInput = {
  title?: string | null;
  personaOverride?: Persona | null;
  seniorityOverride?: Seniority | null;
};

export function scorePersonaFit(input: PersonaScoreInput): ScoreSection {
  const c = classifyTitle(input.title);
  const persona = c.inconclusive && input.personaOverride ? input.personaOverride : c.persona;
  const seniority = c.seniority === "unknown" && input.seniorityOverride ? input.seniorityOverride : c.seniority;

  const fnPts = Math.min(12, FUNCTION_POINTS[persona]);
  const senPts = Math.min(8, SENIORITY_POINTS[seniority]);
  const wfPts = Math.min(7, workflowProximityPoints(persona));
  const infPts = Math.min(3, decisionInfluencePoints(seniority));

  const factors: ScoreFactor[] = [
    {
      key: "function",
      label: "Function ownership",
      points: fnPts,
      max: 12,
      note: input.title ? `"${input.title}" → ${persona.replace(/_/g, " ")}` : "Title unknown",
    },
    { key: "seniority", label: "Seniority", points: senPts, max: 8, note: seniority.replace(/_/g, " ") },
    { key: "workflow", label: "Workflow proximity", points: wfPts, max: 7, note: wfPts ? "Role aligns with operational workflows" : "Limited workflow ownership" },
    { key: "influence", label: "Decision influence", points: infPts, max: 3, note: infPts ? "Likely budget influence" : "Influence unclear" },
  ];
  return { total: Math.min(MAX.persona, fnPts + senPts + wfPts + infPts), max: MAX.persona, factors };
}

export type TitleClassification = ReturnType<typeof classifyTitle>;
export { classifyTitle } from "./personas";
