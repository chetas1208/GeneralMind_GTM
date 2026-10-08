import type { ResearchTarget, EvidenceCandidate } from "./types";
import { EvidenceBlackboard } from "../blackboard/blackboard";
import { BudgetTracker } from "./budget";
import { calculateCoverage } from "./coverage";
import { evaluateStopPolicy } from "./stop-policy";
import { buildFrontierFromBlackboard } from "./frontier";
import { compileResearchPlan } from "./planner";
import { dedupeEvidenceCandidates } from "./query-deduper";
import { getSharedGovernor } from "./governor";
import { ApiLedger } from "./ledger";
import { getCachedQueryResult, setCachedQueryResult } from "../cache/query-cache";
import { getCachedCompany, setCachedCompany } from "../cache/entity-cache";
import { exaSearch } from "@/lib/integrations/exa/search";
import { chatWithRole } from "@/lib/ai/router";
import { isConfigured } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("search-compiler");

export type CompilerResearchOutput = {
  targetId: string;
  targetName: string;
  coveragePct: number;
  isViable: boolean;
  disconfirmed: boolean;
  stopReason: string;
  hypothesis: {
    workflow: string;
    whyNow: string;
    whyGeneralMind: string;
    painPoints: string[];
    recommendedBuyer: string | null;
  };
  blackboard: ReturnType<EvidenceBlackboard["serialize"]>;
  ledger: ReturnType<ApiLedger["finish"]>;
};

export async function executeCompilerResearch(target: ResearchTarget): Promise<CompilerResearchOutput> {
  const ledger = new ApiLedger();
  const budget = new BudgetTracker(target.budget);
  const blackboard = new EvidenceBlackboard(target.targetId);
  const governor = getSharedGovernor();

  log.info("compiler: starting research", { target: target.name, id: target.targetId });

  // 1. Cross-lead / cross-event cache check
  const cachedCompany = getCachedCompany(target.domain || target.name);
  if (cachedCompany) {
    if (cachedCompany.industry) {
      blackboard.addClaim({
        id: `cache-ind-${Date.now()}`,
        slotKey: "company.industry",
        claim: cachedCompany.industry,
        excerpt: "Cached firmographic profile",
        sourceUrl: `https://${cachedCompany.domain}`,
        sourceType: "cache",
        lane: "persona",
        confidence: 85,
        retrievedAt: new Date(cachedCompany.savedAt).toISOString(),
      });
    }
    if (cachedCompany.erpStack && cachedCompany.erpStack.length > 0) {
      blackboard.addClaim({
        id: `cache-erp-${Date.now()}`,
        slotKey: "technology.erp",
        claim: cachedCompany.erpStack.join(", "),
        excerpt: "Cached technology stack",
        sourceUrl: `https://${cachedCompany.domain}`,
        sourceType: "cache",
        lane: "technology",
        confidence: 85,
        retrievedAt: new Date(cachedCompany.savedAt).toISOString(),
      });
    }
    log.info("compiler: reused cached entity firmographics", { domain: cachedCompany.domain });
  }

  // Add existing known facts
  for (const f of target.knownFacts) {
    blackboard.addClaim({
      id: f.id,
      slotKey: f.slotKey,
      claim: f.claim,
      excerpt: f.claim,
      sourceUrl: f.sourceUrl,
      sourceType: f.sourceType,
      lane: "workflow",
      confidence: f.confidenceBand === "confirmed" ? 90 : 70,
      retrievedAt: f.retrievedAt,
    });
  }

  // 2. Compile research plan (1 LLM call or deterministic fallback)
  budget.recordLLM(400, 300);
  ledger.recordLLM(400, 300);
  const plan = await compileResearchPlan(target);

  // 3. Parallel search execution across orthogonal lanes
  const allCandidates: EvidenceCandidate[] = [];
  const searchPromises = plan.queries.map(async (pq) => {
    if (!budget.canSearch()) return;

    // Check query cache
    const cached = getCachedQueryResult(pq.query);
    if (cached) {
      ledger.recordSearch(true);
      for (const r of cached) {
        allCandidates.push({
          url: r.url,
          canonicalUrl: r.url,
          title: r.title ?? "",
          snippet: r.text ?? "",
          publishedAt: r.publishedDate ?? null,
          lane: pq.lane,
          queryId: pq.id,
          score: r.score,
        });
      }
      return;
    }

    // Execute through Adaptive Concurrency Governor
    const release = await governor.acquireSlot();
    const startReq = Date.now();
    try {
      if (!isConfigured("EXA_API_KEY")) {
        // Safe offline mode simulation if no key
        return;
      }
      budget.recordSearch();
      ledger.recordSearch(false);

      const out = await exaSearch({
        query: pq.query,
        numResults: 4,
        maxCharacters: 1_200,
      });

      governor.recordSuccess(Date.now() - startReq);
      setCachedQueryResult(pq.query, out.results);

      for (const r of out.results) {
        allCandidates.push({
          url: r.url,
          canonicalUrl: r.url,
          title: r.title ?? "",
          snippet: r.text ?? "",
          publishedAt: r.publishedDate ?? null,
          lane: pq.lane,
          queryId: pq.id,
          score: r.score,
        });
      }
    } catch (e: unknown) {
      const is429 = typeof e === "object" && e !== null && "status" in e && (e as { status: number }).status === 429;
      if (is429) governor.record429();
      else governor.recordFailure();
      log.warn("compiler: search lane query failed", { query: pq.query, error: String(e) });
    } finally {
      release();
    }
  });

  await Promise.all(searchPromises);

  // 4. Deduplicate and extract claims into Evidence Blackboard
  const uniqueCandidates = dedupeEvidenceCandidates(allCandidates);
  for (let i = 0; i < uniqueCandidates.length; i++) {
    const c = uniqueCandidates[i];
    const textLower = c.snippet.toLowerCase() + " " + c.title.toLowerCase();

    // Deterministic extraction without LLM calls
    if (c.lane === "technology") {
      const erp = textLower.includes("sap") ? "SAP S/4HANA" : textLower.includes("oracle") ? "Oracle Fusion" : textLower.includes("coupa") ? "Coupa" : null;
      if (erp) {
        blackboard.addClaim({
          id: `claim-tech-${i}`,
          slotKey: "technology.erp",
          claim: `${target.name} uses ${erp}`,
          excerpt: c.snippet.slice(0, 200),
          sourceUrl: c.url,
          sourceType: "search",
          lane: c.lane,
          confidence: 75,
          retrievedAt: new Date().toISOString(),
        });
      }
    } else if (c.lane === "persona") {
      blackboard.addClaim({
        id: `claim-per-${i}`,
        slotKey: "personas.operational_buyer",
        claim: c.title.slice(0, 100),
        excerpt: c.snippet.slice(0, 200),
        sourceUrl: c.url,
        sourceType: "search",
        lane: c.lane,
        confidence: 70,
        retrievedAt: new Date().toISOString(),
      });
    } else if (c.lane === "disconfirmation") {
      if (textLower.includes("touchless") || textLower.includes("fully automated")) {
        blackboard.addClaim({
          id: `claim-neg-${i}`,
          slotKey: "negative.already_automated",
          claim: "Processes already automated with existing tools",
          excerpt: c.snippet.slice(0, 200),
          sourceUrl: c.url,
          sourceType: "search",
          lane: c.lane,
          confidence: 85,
          retrievedAt: new Date().toISOString(),
        });
      }
    } else if (c.lane === "transformation" || c.lane === "intent") {
      blackboard.addClaim({
        id: `claim-sig-${i}`,
        slotKey: "signals.transformation",
        claim: c.title.slice(0, 100),
        excerpt: c.snippet.slice(0, 200),
        sourceUrl: c.url,
        sourceType: "search",
        lane: c.lane,
        confidence: 70,
        retrievedAt: new Date().toISOString(),
      });
    }
  }

  // 5. Evaluate Coverage and Stop Policy
  const coverage = calculateCoverage(blackboard, target.workflowHypotheses[0] ?? "p2p");
  const frontier = buildFrontierFromBlackboard(target.name, blackboard);
  const stopDecision = evaluateStopPolicy({
    coverage,
    frontier,
    budget,
    blackboard,
  });

  // Record avoided searches if policy stopped early
  if (stopDecision.shouldStop && frontier.size() > 0) {
    ledger.recordAvoidedSearches(frontier.size());
  }

  // 6. Targeted gap search if not stopped and budget allows (max 1 high-utility gap query)
  if (!stopDecision.shouldStop && budget.canSearch() && frontier.size() > 0) {
    const topAction = frontier.getTopActions(1)[0];
    if (topAction) {
      log.info("compiler: executing targeted gap search from frontier", { query: topAction.query, utility: topAction.searchUtility });
      budget.recordSearch();
      ledger.recordSearch(false);
      try {
        if (isConfigured("EXA_API_KEY")) {
          const res = await exaSearch({ query: topAction.query, numResults: 3, maxCharacters: 1_000 });
          for (const r of res.results) {
            blackboard.addClaim({
              id: `gap-${Date.now()}`,
              slotKey: topAction.gap.slotKey,
              claim: r.title ?? topAction.query,
              excerpt: (r.text ?? "").slice(0, 200),
              sourceUrl: r.url,
              sourceType: "search_gap",
              lane: topAction.lane,
              confidence: 70,
              retrievedAt: new Date().toISOString(),
            });
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  // 7. Resolve contradictions if any
  const contradictions = blackboard.getContradictions();
  if (contradictions.length > 0 && budget.canCallLLM() && isConfigured("NVIDIA_API_KEY")) {
    try {
      budget.recordLLM(500, 150);
      ledger.recordLLM(500, 150);
      const first = contradictions[0];
      const res = await chatWithRole("DIFFICULT_CONTRADICTION", {
        system: "Resolve conflicting business claims with a 1-sentence interpretation. Output JSON: {\"interpretation\": \"...\"}",
        user: `Claim A: ${first.claimA.claim}\nClaim B: ${first.claimB.claim}`,
        json: true,
        maxTokens: 100,
      });
      const parsed = JSON.parse(res.text) as { interpretation?: string };
      first.resolved = true;
      first.resolution = parsed.interpretation ?? "Resolved";
    } catch {
      /* ignore */
    }
  }

  // 8. 1 Synthesis LLM call to produce opportunity and rationale
  const finalCoverage = calculateCoverage(blackboard, target.workflowHypotheses[0] ?? "p2p");
  let hypothesis = {
    workflow: target.workflowHypotheses[0] ?? "p2p",
    whyNow: `Active modernization initiatives identified at ${target.name}.`,
    whyGeneralMind: `GeneralMind eliminates manual workflow exceptions across ${target.name}'s systems.`,
    painPoints: ["Manual ERP exception matching", "Supplier communication friction"],
    recommendedBuyer: target.personName ?? null,
  };

  if (budget.canCallLLM() && isConfigured("NVIDIA_API_KEY") && !blackboard.isCriticalDisconfirmed()) {
    try {
      budget.recordLLM(800, 300);
      ledger.recordLLM(800, 300);
      const prompt = `Synthesize GTM opportunity hypothesis for:
Target: ${target.name}
Workflow: ${target.workflowHypotheses[0] ?? "p2p"}
Resolved facts: ${blackboard.getAllSlots().filter((s) => s.state === "supported").map((s) => `${s.label}: ${s.value}`).join("; ")}

Return JSON:
{
  "workflow": "p2p",
  "whyNow": "2 sentence explanation of urgency and timing",
  "whyGeneralMind": "2 sentence explanation of GeneralMind solution fit",
  "painPoints": ["pain 1", "pain 2"],
  "recommendedBuyer": "target title or name"
}`;

      const res = await chatWithRole("SYNTHESIZER", {
        system: "You are an executive GTM intelligence analyst. Output only valid JSON.",
        user: prompt,
        json: true,
        maxTokens: 400,
        temperature: 0.1,
      });
      const parsed = JSON.parse(res.text) as typeof hypothesis;
      if (parsed.whyNow && parsed.whyGeneralMind) {
        hypothesis = parsed;
      }
    } catch (e) {
      log.warn("compiler: synthesis LLM call failed, using deterministic fallback", { error: String(e) });
    }
  }

  // Cache discovered company entity for future cross-event reuse
  if (target.domain) {
    const erpSlot = blackboard.getSlot("technology.erp");
    const indSlot = blackboard.getSlot("company.industry");
    setCachedCompany(target.domain, {
      domain: target.domain,
      name: target.name,
      industry: indSlot?.value ?? null,
      erpStack: erpSlot?.value ? [erpSlot.value] : [],
    });
  }

  return {
    targetId: target.targetId,
    targetName: target.name,
    coveragePct: finalCoverage.coveragePct,
    isViable: !blackboard.isCriticalDisconfirmed(),
    disconfirmed: blackboard.isCriticalDisconfirmed(),
    stopReason: stopDecision.explanation,
    hypothesis,
    blackboard: blackboard.serialize(),
    ledger: ledger.finish(),
  };
}
