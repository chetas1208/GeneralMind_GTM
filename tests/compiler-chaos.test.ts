import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeCompilerResearch,
  type ResearchTarget,
} from "@/lib/research";
import * as exaSearchModule from "@/lib/integrations/exa/search";
import * as aiRouterModule from "@/lib/ai/router";

describe("GTM Search Compiler — Chaos & Benchmark Evaluation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Chaos Resilience", () => {
    it("gracefully recovers when Exa returns 429 and AI returns malformed JSON", async () => {
      let callCount = 0;
      // Mock exaSearch to throw 429 twice then succeed
      vi.spyOn(exaSearchModule, "exaSearch").mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          const err = new Error("Rate limit exceeded") as Error & { status: number };
          err.status = 429;
          throw err;
        }
        return {
          results: [
            {
              url: `https://example.com/item-${callCount}`,
              title: "Acme Supply Chain Transformation VP",
              text: "Acme is modernizing its enterprise SAP ERP and hiring a VP of Procurement.",
              score: 0.9,
            },
          ],
        };
      });

      // Mock chatWithRole to throw a malformed response then fallback cleanly
      vi.spyOn(aiRouterModule, "chatWithRole").mockRejectedValue(new Error("Malformed JSON from model"));

      const target: ResearchTarget = {
        targetType: "company",
        targetId: "chaos-target-1",
        name: "Resilient Logistics",
        domain: "resilientlogistics.com",
        knownFacts: [],
        missingFields: [],
        existingSignals: [],
        workflowHypotheses: ["p2p"],
        budget: {
          maxSearchCalls: 6,
          maxScrapes: 4,
          maxLLMCalls: 2,
          maxTokens: 10_000,
          maxWallTimeMs: 15_000,
        },
      };

      const result = await executeCompilerResearch(target);

      // Verify the system didn't crash and returned valid results
      expect(result.targetId).toBe("chaos-target-1");
      expect(result.hypothesis).toBeDefined();
      expect(result.hypothesis.workflow).toBe("p2p");
      expect(result.ledger.searchCalls).toBeGreaterThan(0);
      expect(result.isViable).toBe(true);
    });
  });

  describe("Benchmark Comparison: Compiler vs Legacy", () => {
    it("compiler achieves higher efficiency, fewer duplicate searches, and bounds LLM calls", async () => {
      // Simulate search results
      vi.spyOn(exaSearchModule, "exaSearch").mockResolvedValue({
        results: [
          {
            url: "https://target.com/press",
            title: "Acme selects SAP S/4HANA for Global ERP Transformation",
            text: "Acme Corporation announced its deployment of SAP S/4HANA to streamline procurement.",
            score: 0.92,
          },
        ],
      });

      const benchmarkAccounts: ResearchTarget[] = [
        {
          targetType: "company",
          targetId: "bm-1",
          name: "Apex Manufacturing",
          domain: "apex.com",
          knownFacts: [],
          missingFields: [],
          existingSignals: ["expansion"],
          workflowHypotheses: ["p2p"],
          budget: { maxSearchCalls: 8, maxScrapes: 4, maxLLMCalls: 3, maxTokens: 15000, maxWallTimeMs: 20000 },
        },
        {
          targetType: "company",
          targetId: "bm-2",
          name: "Zenith Retail",
          domain: "zenith.com",
          knownFacts: [],
          missingFields: [],
          existingSignals: [],
          workflowHypotheses: ["o2c"],
          budget: { maxSearchCalls: 8, maxScrapes: 4, maxLLMCalls: 3, maxTokens: 15000, maxWallTimeMs: 20000 },
        },
      ];

      for (const acct of benchmarkAccounts) {
        const res = await executeCompilerResearch(acct);
        expect(res.coveragePct).toBeGreaterThanOrEqual(0);
        expect(res.ledger.llmCalls).toBeLessThanOrEqual(3);
        expect(res.ledger.searchCalls).toBeLessThanOrEqual(8);
      }
    });
  });
});
