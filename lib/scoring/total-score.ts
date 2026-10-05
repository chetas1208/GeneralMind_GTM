import { SCORING_VERSION } from "./config";
import { scoreCompany } from "./company-score";
import { attendanceConfidence, scoreIntent } from "./intent-score";
import { scorePersona } from "./persona-score";
import type { CompanyScoreInput, IntentScoreInput, PersonaScoreInput, ScoreSection } from "./types";

export type LeadScore = {
  company: ScoreSection;
  persona: ScoreSection;
  intent: ScoreSection;
  total: number;
  version: string;
  attendanceConfidence: number;
};

export function scoreLead(input: {
  company: CompanyScoreInput;
  persona: PersonaScoreInput;
  intent: IntentScoreInput;
  enrichmentConfirmsRole?: boolean;
}): LeadScore {
  const company = scoreCompany(input.company);
  const persona = scorePersona(input.persona);
  const intent = scoreIntent(input.intent);
  return {
    company,
    persona,
    intent,
    total: company.total + persona.total + intent.total,
    version: SCORING_VERSION,
    attendanceConfidence: attendanceConfidence(input.intent.attendanceType, {
      independentSources: input.intent.independentSources,
      enrichmentConfirmsRole: input.enrichmentConfirmsRole,
    }),
  };
}
