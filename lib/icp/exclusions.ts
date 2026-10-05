import { classifyTitle } from "./personas";

const NEGATIVE_TITLE = /\b(recruit|talent|human resources|\bhr\b|marketing|communications|\bpr\b|software engineer|research scientist|legal counsel|\blawyer\b|student|intern\b|consultant|investor relations|brand manager|social media|content strategist|graphic designer)\b/i;

/** Titles that should not receive Apollo enrichment spend. */
export function isNegativePersona(title: string | null | undefined): boolean {
  if (!title) return false;
  if (NEGATIVE_TITLE.test(title)) return true;
  const c = classifyTitle(title);
  return c.persona === "other" && c.seniority === "individual";
}
