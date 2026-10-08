import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EvidenceBlackboard,
  AdaptiveConcurrencyGovernor,
  BudgetTracker,
  calculateCoverage,
  computeSearchUtility,
  buildFrontierFromBlackboard,
  evaluateStopPolicy,
  dedupePlannedQueries,
  dedupeEvidenceCandidates,
  generateOrthogonalQueries,
  getCachedQueryResult,
  setCachedQueryResult,
  clearQueryCache,
  getCachedCompany,
  setCachedCompany,
  executeCompilerResearch,
  type ResearchTarget,
  type PlannedQuery,
} from "@/lib/research";

describe("GTM Search Compiler", () => {
  beforeEach(() => {
    clearQueryCache();
    vi.restoreAllMocks();
  });

  describe("Query Deduplication & Orthogonal Lanes", () => {
    it("deduplicates semantically equivalent queries", () => {
      const queries: PlannedQuery[] = [
        { id: "1", lane: "persona", query: "Acme VP Procurement", expectedInformationGain: 0.8, estimatedCost: 0.05, priority: 5, resolves: ["personas.operational_buyer"], independentOf: [] },
        { id: "2", lane: "persona", query: "acme vp   procurement!", expectedInformationGain: 0.8, estimatedCost: 0.05, priority: 5, resolves: ["personas.operational_buyer"], independentOf: [] },
        { id: "3", lane: "technology", query: "Acme SAP S/4HANA", expectedInformationGain: 0.8, estimatedCost: 0.05, priority: 4, resolves: ["technology.erp"], independentOf: [] },
      ];

      const deduped = dedupePlannedQueries(queries);
      expect(deduped).toHaveLength(2);
      expect(deduped[0].id).toBe("1");
      expect(deduped[1].id).toBe("3");
    });

    it("generates queries across orthogonal lanes including disconfirmation", () => {
      const target: ResearchTarget = {
        targetType: "company",
        targetId: "comp-1",
        name: "Acme Corp",
        knownFacts: [],
        missingFields: [],
        existingSignals: [],
        workflowHypotheses: ["p2p"],
        budget: { maxSearchCalls: 10, maxScrapes: 5, maxLLMCalls: 3, maxTokens: 20000, maxWallTimeMs: 30000 },
      };

      const queries = generateOrthogonalQueries(target, "p2p");
      const lanes = new Set(queries.map((q) => q.lane));

      expect(lanes.has("persona")).toBe(true);
      expect(lanes.has("transformation")).toBe(true);
      expect(lanes.has("technology")).toBe(true);
      expect(lanes.has("intent")).toBe(true);
      expect(lanes.has("workflow")).toBe(true);
      expect(lanes.has("disconfirmation")).toBe(true);
    });

    it("deduplicates evidence candidates by canonical url and title", () => {
      const candidates = [
        { url: "https://example.com/page?ref=1", canonicalUrl: "https://example.com/page", title: "VP of Supply Chain", snippet: "Sarah Chen", lane: "persona" as const, queryId: "q1" },
        { url: "https://example.com/page", canonicalUrl: "https://example.com/page", title: "VP of Supply Chain", snippet: "Sarah Chen", lane: "persona" as const, queryId: "q2" },
        { url: "https://other.com/news", canonicalUrl: "https://other.com/news", title: "Acme Modernization", snippet: "New initiatives", lane: "transformation" as const, queryId: "q3" },
      ];

      const deduped = dedupeEvidenceCandidates(candidates);
      expect(deduped).toHaveLength(2);
    });
  });

  describe("Adaptive Concurrency Governor (AIMD)", () => {
    it("starts at initial limit and increases on success window", () => {
      const governor = new AdaptiveConcurrencyGovernor(2, 6);
      expect(governor.getCurrentLimit()).toBe(2);

      // Record 4 consecutive successes -> limit increases to 3
      governor.recordSuccess(120);
      governor.recordSuccess(110);
      governor.recordSuccess(100);
      governor.recordSuccess(95);

      expect(governor.getCurrentLimit()).toBe(3);
    });

    it("cuts concurrency in half on 429 rate limit", () => {
      const governor = new AdaptiveConcurrencyGovernor(6, 8);
      governor.record429();
      expect(governor.getCurrentLimit()).toBe(3);

      governor.record429();
      expect(governor.getCurrentLimit()).toBe(2);

      governor.record429();
      expect(governor.getCurrentLimit()).toBe(1); // floor is 1
    });

    it("acquires and releases execution slots cleanly", async () => {
      const governor = new AdaptiveConcurrencyGovernor(2, 4);
      const release1 = await governor.acquireSlot();
      const release2 = await governor.acquireSlot();

      expect(governor.getInFlight()).toBe(2);

      release1();
      expect(governor.getInFlight()).toBe(1);

      release2();
      expect(governor.getInFlight()).toBe(0);
    });
  });

  describe("Coverage & Research Frontier", () => {
    it("calculates workflow-aware decision-weighted coverage", () => {
      const bb = new EvidenceBlackboard("target-1");
      const initial = calculateCoverage(bb, "p2p");
      expect(initial.coveragePct).toBe(0);
      expect(initial.isSufficient).toBe(false);

      // Add supported claims
      bb.addClaim({
        id: "c1",
        slotKey: "personas.operational_buyer",
        claim: "Sarah Chen is VP Procurement",
        excerpt: "Bio page",
        sourceUrl: "https://acme.com",
        sourceType: "website",
        lane: "persona",
        confidence: 85,
        retrievedAt: new Date().toISOString(),
      });

      const updated = calculateCoverage(bb, "p2p");
      expect(updated.coveragePct).toBeGreaterThan(0);
      expect(updated.resolvedSlots).toContain("personas.operational_buyer");
    });

    it("computes search utility and sorts frontier descending", () => {
      const u1 = computeSearchUtility({
        gap: { slotKey: "personas.operational_buyer", importance: 5, description: "Procurement Buyer", lane: "persona" },
        query: "Acme VP Procurement",
        lane: "persona",
        expectedInformationGain: 0.9,
        decisionImportance: 5,
        probabilityOfFindingEvidence: 0.8,
        estimatedCost: 0.05,
      });

      const u2 = computeSearchUtility({
        gap: { slotKey: "company.locations", importance: 2, description: "Headquarters", lane: "transformation" },
        query: "Acme Headquarters address",
        lane: "transformation",
        expectedInformationGain: 0.2,
        decisionImportance: 2,
        probabilityOfFindingEvidence: 0.9,
        estimatedCost: 0.05,
      });

      expect(u1.searchUtility).toBeGreaterThan(u2.searchUtility);
    });

    it("extracts next actions from blackboard frontier", () => {
      const bb = new EvidenceBlackboard("target-1");
      const frontier = buildFrontierFromBlackboard("Acme Corp", bb);

      expect(frontier.size()).toBeGreaterThan(0);
      const topActions = frontier.getTopActions(2);
      expect(topActions).toHaveLength(2);
      expect(topActions[0].searchUtility).toBeGreaterThanOrEqual(topActions[1].searchUtility);
    });
  });

  describe("Stop Policy", () => {
    it("stops when critical disconfirmation is found", () => {
      const bb = new EvidenceBlackboard("target-1");
      bb.addClaim({
        id: "c-disconfirm",
        slotKey: "negative.already_automated",
        claim: "Acme has 100% touchless AP with automated software",
        excerpt: "Press release",
        sourceUrl: "https://news.com",
        sourceType: "press",
        lane: "disconfirmation",
        confidence: 90,
        retrievedAt: new Date().toISOString(),
      });

      const budget = new BudgetTracker({ maxSearchCalls: 10, maxScrapes: 5, maxLLMCalls: 3, maxTokens: 10000, maxWallTimeMs: 30000 });
      const coverage = calculateCoverage(bb, "p2p");
      const frontier = buildFrontierFromBlackboard("Acme Corp", bb);

      const decision = evaluateStopPolicy({ coverage, frontier, budget, blackboard: bb });
      expect(decision.shouldStop).toBe(true);
      expect(decision.reason).toBe("critical_disconfirmed");
    });

    it("stops when search budget is exhausted", () => {
      const bb = new EvidenceBlackboard("target-1");
      const budget = new BudgetTracker({ maxSearchCalls: 1, maxScrapes: 5, maxLLMCalls: 3, maxTokens: 10000, maxWallTimeMs: 30000 });
      budget.recordSearch(); // 1 search used of 1

      const coverage = calculateCoverage(bb, "p2p");
      const frontier = buildFrontierFromBlackboard("Acme Corp", bb);

      const decision = evaluateStopPolicy({ coverage, frontier, budget, blackboard: bb });
      expect(decision.shouldStop).toBe(true);
      expect(decision.reason).toBe("budget_exhausted");
    });
  });

  describe("Caching & Cross-Lead Reuse", () => {
    it("caches query results and reuses them on subsequent requests", () => {
      const query = "Acme Supply Chain 2026";
      expect(getCachedQueryResult(query)).toBeNull();

      setCachedQueryResult(query, [
        { url: "https://acme.com/supply-chain", title: "Acme SC", text: "Text content", score: 0.95 },
      ]);

      const hit = getCachedQueryResult(query);
      expect(hit).toHaveLength(1);
      expect(hit?.[0].title).toBe("Acme SC");
    });

    it("reuses canonical entity firmographics across events", () => {
      setCachedCompany("acme.com", {
        domain: "acme.com",
        name: "Acme Corp",
        industry: "Aerospace Manufacturing",
        erpStack: ["SAP S/4HANA"],
      });

      const cached = getCachedCompany("acme.com");
      expect(cached).not.toBeNull();
      expect(cached?.industry).toBe("Aerospace Manufacturing");
      expect(cached?.erpStack).toContain("SAP S/4HANA");
    });
  });

  describe("Contradiction Detection on Blackboard", () => {
    it("flags conflicting business claims on the same slot", () => {
      const bb = new EvidenceBlackboard("target-1");

      bb.addClaim({
        id: "c1",
        slotKey: "personas.operational_buyer",
        claim: "Sarah Chen is VP Procurement at Acme",
        excerpt: "Profile",
        sourceUrl: "https://linkedin.com/in/sarah",
        sourceType: "profile",
        lane: "persona",
        confidence: 80,
        retrievedAt: new Date().toISOString(),
      });

      bb.addClaim({
        id: "c2",
        slotKey: "personas.operational_buyer",
        claim: "Sarah Chen left company and is no longer at Acme",
        excerpt: "News article",
        sourceUrl: "https://industry.com/news",
        sourceType: "news",
        lane: "persona",
        confidence: 75,
        retrievedAt: new Date().toISOString(),
      });

      const contradictions = bb.getContradictions();
      expect(contradictions).toHaveLength(1);
      expect(contradictions[0].slotKey).toBe("personas.operational_buyer");
      expect(bb.getSlot("personas.operational_buyer")?.state).toBe("conflicted");
    });
  });

  describe("End-to-End Compiler Execution", () => {
    it("executes research compiler, enforces budget, and returns ledger metrics", async () => {
      const target: ResearchTarget = {
        targetType: "company",
        targetId: "comp-99",
        name: "Omni Logistics",
        domain: "omnilogistics.com",
        knownFacts: [],
        missingFields: [],
        existingSignals: ["expansion"],
        workflowHypotheses: ["p2p"],
        budget: {
          maxSearchCalls: 6,
          maxScrapes: 4,
          maxLLMCalls: 2,
          maxTokens: 15_000,
          maxWallTimeMs: 15_000,
        },
      };

      const result = await executeCompilerResearch(target);

      expect(result.targetId).toBe("comp-99");
      expect(result.targetName).toBe("Omni Logistics");
      expect(result.hypothesis).toBeDefined();
      expect(result.ledger).toBeDefined();
      expect(result.ledger.efficiencyMetrics).toBeDefined();
      expect(result.ledger.llmCalls).toBeLessThanOrEqual(2);
    });
  });
});
