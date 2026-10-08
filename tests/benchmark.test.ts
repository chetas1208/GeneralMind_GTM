import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeCompilerResearch,
  executeLegacyResearch,
  type ResearchTarget,
} from "@/lib/research";
import * as exaSearchModule from "@/lib/integrations/exa/search";
import * as aiRouterModule from "@/lib/ai/router";

type TargetEvaluation = {
  category: "event" | "strong_account" | "weak_account" | "ambiguous_account";
  target: ResearchTarget;
};

const EVALUATION_SET: TargetEvaluation[] = [
  // 3 Event Research Targets
  {
    category: "event",
    target: {
      targetType: "event",
      targetId: "evt-procurecon-2026",
      name: "ProcureCon Indirect West 2026",
      domain: "procureconwest.wbresearch.com",
      eventName: "ProcureCon West 2026",
      knownFacts: [],
      missingFields: [],
      existingSignals: ["conference", "indirect_procurement"],
      workflowHypotheses: ["p2p", "ap_automation"],
      budget: { maxSearchCalls: 10, maxScrapes: 6, maxLLMCalls: 3, maxTokens: 25000, maxWallTimeMs: 30000 },
    },
  },
  {
    category: "event",
    target: {
      targetType: "event",
      targetId: "evt-gartner-supply-chain-2026",
      name: "Gartner Supply Chain Symposium/Xpo 2026",
      domain: "gartner.com",
      eventName: "Gartner Supply Chain 2026",
      knownFacts: [],
      missingFields: [],
      existingSignals: ["keynote", "supply_chain_transformation"],
      workflowHypotheses: ["order_management", "o2c"],
      budget: { maxSearchCalls: 10, maxScrapes: 6, maxLLMCalls: 3, maxTokens: 25000, maxWallTimeMs: 30000 },
    },
  },
  {
    category: "event",
    target: {
      targetType: "event",
      targetId: "evt-sig-global-summit-2026",
      name: "SIG Global Executive Summit Fall 2026",
      domain: "sig.org",
      eventName: "SIG Summit 2026",
      knownFacts: [],
      missingFields: [],
      existingSignals: ["executive_roundtable", "sourcing"],
      workflowHypotheses: ["p2p"],
      budget: { maxSearchCalls: 10, maxScrapes: 6, maxLLMCalls: 3, maxTokens: 25000, maxWallTimeMs: 30000 },
    },
  },

  // 5 Strong Enterprise Accounts
  {
    category: "strong_account",
    target: {
      targetType: "company",
      targetId: "sa-1-omni-logistics",
      name: "Omni Logistics Global",
      domain: "omnilogistics.com",
      personName: "Marcus Vance",
      personTitle: "VP Global Procurement",
      knownFacts: [],
      missingFields: [],
      existingSignals: ["supply_chain_expansion", "sap_migration"],
      workflowHypotheses: ["p2p", "ap_automation"],
      budget: { maxSearchCalls: 10, maxScrapes: 6, maxLLMCalls: 3, maxTokens: 25000, maxWallTimeMs: 30000 },
    },
  },
  {
    category: "strong_account",
    target: {
      targetType: "company",
      targetId: "sa-2-vanguard-packaging",
      name: "Vanguard Packaging & Supply",
      domain: "vanguardpackaging.com",
      personName: "Elena Rostova",
      personTitle: "Chief Sourcing Officer",
      knownFacts: [],
      missingFields: [],
      existingSignals: ["erp_overhaul", "vendor_consolidation"],
      workflowHypotheses: ["p2p"],
      budget: { maxSearchCalls: 10, maxScrapes: 6, maxLLMCalls: 3, maxTokens: 25000, maxWallTimeMs: 30000 },
    },
  },
  {
    category: "strong_account",
    target: {
      targetType: "company",
      targetId: "sa-3-solaris-health",
      name: "Solaris Health Network",
      domain: "solarishealth.com",
      personName: "David Sterling",
      personTitle: "VP Supply Chain Operations",
      knownFacts: [],
      missingFields: [],
      existingSignals: ["hospital_merger", "oracle_cloud"],
      workflowHypotheses: ["order_management", "p2p"],
      budget: { maxSearchCalls: 10, maxScrapes: 6, maxLLMCalls: 3, maxTokens: 25000, maxWallTimeMs: 30000 },
    },
  },
  {
    category: "strong_account",
    target: {
      targetType: "company",
      targetId: "sa-4-apex-industrial",
      name: "Apex Industrial Components",
      domain: "apexind.com",
      personName: "Sarah Chen",
      personTitle: "Director of Accounts Payable & Shared Services",
      knownFacts: [],
      missingFields: [],
      existingSignals: ["invoice_processing_backlog", "shared_services"],
      workflowHypotheses: ["ap_automation"],
      budget: { maxSearchCalls: 10, maxScrapes: 6, maxLLMCalls: 3, maxTokens: 25000, maxWallTimeMs: 30000 },
    },
  },
  {
    category: "strong_account",
    target: {
      targetType: "company",
      targetId: "sa-5-meridian-retail",
      name: "Meridian Retail Brands",
      domain: "meridianretail.com",
      personName: "Thomas Wright",
      personTitle: "SVP Order-to-Cash & Customer Operations",
      knownFacts: [],
      missingFields: [],
      existingSignals: ["omnichannel_growth", "erp_transformation"],
      workflowHypotheses: ["o2c", "order_management"],
      budget: { maxSearchCalls: 10, maxScrapes: 6, maxLLMCalls: 3, maxTokens: 25000, maxWallTimeMs: 30000 },
    },
  },

  // 3 Weak Accounts (Low Fit / Misaligned Persona / Low Volume)
  {
    category: "weak_account",
    target: {
      targetType: "company",
      targetId: "wa-1-boutique-design",
      name: "Studio Prism Design",
      domain: "prismdesign.io",
      personName: "Chloe Dupont",
      personTitle: "Creative Director",
      knownFacts: [],
      missingFields: [],
      existingSignals: ["agency_award"],
      workflowHypotheses: ["general"],
      budget: { maxSearchCalls: 8, maxScrapes: 4, maxLLMCalls: 3, maxTokens: 15000, maxWallTimeMs: 20000 },
    },
  },
  {
    category: "weak_account",
    target: {
      targetType: "company",
      targetId: "wa-2-local-cafe-group",
      name: "Bay Area Micro Roasters",
      domain: "bayarearoasters.net",
      personName: "Alex Rivera",
      personTitle: "Barista Lead & Ops",
      knownFacts: [],
      missingFields: [],
      existingSignals: [],
      workflowHypotheses: ["general"],
      budget: { maxSearchCalls: 8, maxScrapes: 4, maxLLMCalls: 3, maxTokens: 15000, maxWallTimeMs: 20000 },
    },
  },
  {
    category: "weak_account",
    target: {
      targetType: "company",
      targetId: "wa-3-early-saas",
      name: "MicroWidget Inc",
      domain: "microwidget.app",
      personName: "Timmy Developer",
      personTitle: "Founder & Full-stack Engineer",
      knownFacts: [],
      missingFields: [],
      existingSignals: ["seed_round"],
      workflowHypotheses: ["general"],
      budget: { maxSearchCalls: 8, maxScrapes: 4, maxLLMCalls: 3, maxTokens: 15000, maxWallTimeMs: 20000 },
    },
  },

  // 3 Ambiguous Accounts (Partial signals / Mixed evidence / Conflicting persona)
  {
    category: "ambiguous_account",
    target: {
      targetType: "company",
      targetId: "aa-1-finova-technologies",
      name: "Finova Technologies",
      domain: "finovatech.com",
      personName: "Rachel Adams",
      personTitle: "VP Operations & IT",
      knownFacts: [],
      missingFields: [],
      existingSignals: ["cloud_migration", "mixed_erp"],
      workflowHypotheses: ["p2p", "general"],
      budget: { maxSearchCalls: 10, maxScrapes: 6, maxLLMCalls: 3, maxTokens: 20000, maxWallTimeMs: 25000 },
    },
  },
  {
    category: "ambiguous_account",
    target: {
      targetType: "company",
      targetId: "aa-2-kestrel-aviation",
      name: "Kestrel Aviation Parts",
      domain: "kestrelaviation.com",
      personName: "Gregory Stone",
      personTitle: "Director of Supplier Relations",
      knownFacts: [],
      missingFields: [],
      existingSignals: ["defense_contract", "legacy_edi"],
      workflowHypotheses: ["p2p", "order_management"],
      budget: { maxSearchCalls: 10, maxScrapes: 6, maxLLMCalls: 3, maxTokens: 20000, maxWallTimeMs: 25000 },
    },
  },
  {
    category: "ambiguous_account",
    target: {
      targetType: "company",
      targetId: "aa-3-lumina-consumer",
      name: "Lumina Consumer Goods",
      domain: "luminagoods.com",
      personName: "Monica Bell",
      personTitle: "Head of Digital Commerce & Logistics",
      knownFacts: [],
      missingFields: [],
      existingSignals: ["d2c_expansion", "3pl_transition"],
      workflowHypotheses: ["o2c", "p2p"],
      budget: { maxSearchCalls: 10, maxScrapes: 6, maxLLMCalls: 3, maxTokens: 20000, maxWallTimeMs: 25000 },
    },
  },
];

describe("GTM Search Compiler Benchmark Verification", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("benchmarks legacy vs compiler across 14 representative targets with measured reductions", async () => {
    vi.spyOn(exaSearchModule, "exaSearch").mockImplementation(async (opts) => {
      const q = opts.query.toLowerCase();
      const isDisconfirmation = q.includes("touchless ap") || q.includes("fully automated");
      return {
        results: [
          {
            url: `https://intel-source.com/${encodeURIComponent(opts.query.slice(0, 20))}`,
            title: `Enterprise Intel for ${opts.query.slice(0, 30)}`,
            text: isDisconfirmation
              ? "Company still relies on manual spreadsheet tracking for vendor invoicing."
              : "Enterprise deploying SAP S/4HANA ERP and actively hiring procurement leadership.",
            score: 0.91,
          },
        ],
      };
    });

    vi.spyOn(aiRouterModule, "chatWithRole").mockResolvedValue({
      model: "meta/llama-3.3-70b-instruct",
      text: JSON.stringify({
        queries: [
          {
            id: "q-planned-1",
            lane: "persona",
            query: "VP Procurement executive appointment",
            expectedInformationGain: 0.85,
            estimatedCost: 1,
            priority: 1,
            resolves: ["contact_identity"],
            independentOf: [],
          },
        ],
      }),
    });

    let legacySearchCalls = 0;
    let legacyScrapes = 0;
    let legacyLlmCalls = 0;
    let legacyWallTimeMs = 0;
    let legacyEvidence = 0;

    let compilerSearchCalls = 0;
    let compilerScrapes = 0;
    let compilerLlmCalls = 0;
    let compilerWallTimeMs = 0;
    let compilerEvidence = 0;
    let compilerCacheHits = 0;

    for (const item of EVALUATION_SET) {
      const leg = await executeLegacyResearch(item.target);
      legacySearchCalls += leg.ledger.searchCalls;
      legacyScrapes += leg.ledger.scrapeCalls;
      legacyLlmCalls += leg.ledger.llmCalls;
      legacyWallTimeMs += leg.ledger.wallTimeMs;
      legacyEvidence += leg.blackboard.claims.length;

      const comp = await executeCompilerResearch(item.target);
      compilerSearchCalls += comp.ledger.searchCalls;
      compilerScrapes += comp.ledger.scrapeCalls;
      compilerLlmCalls += comp.ledger.llmCalls;
      compilerWallTimeMs += comp.ledger.wallTimeMs;
      compilerEvidence += comp.blackboard.claims.length;
      compilerCacheHits += comp.ledger.cacheHits;
    }

    const n = EVALUATION_SET.length;
    const avgLegSearch = legacySearchCalls / n;
    const avgCompSearch = compilerSearchCalls / n;
    const avgLegScrapes = legacyScrapes / n;
    const avgCompScrapes = compilerScrapes / n;
    const avgLegLlm = legacyLlmCalls / n;
    const avgCompLlm = compilerLlmCalls / n;

    // Search calls reduction > 40%
    expect(avgCompSearch).toBeLessThan(avgLegSearch);
    const searchReduction = ((avgLegSearch - avgCompSearch) / avgLegSearch) * 100;
    expect(searchReduction).toBeGreaterThanOrEqual(40);

    // Scrapes reduction > 40%
    expect(avgCompScrapes).toBeLessThan(avgLegScrapes);
    const scrapeReduction = ((avgLegScrapes - avgCompScrapes) / avgLegScrapes) * 100;
    expect(scrapeReduction).toBeGreaterThanOrEqual(40);

    // LLM calls bounded to 2-3 per target
    expect(avgCompLlm).toBeLessThanOrEqual(3);
    const llmReduction = ((avgLegLlm - avgCompLlm) / avgLegLlm) * 100;
    expect(llmReduction).toBeGreaterThanOrEqual(50);

    // Wall time reduction
    expect(compilerWallTimeMs).toBeLessThan(legacyWallTimeMs);
    const wallTimeReduction = ((legacyWallTimeMs - compilerWallTimeMs) / legacyWallTimeMs) * 100;

    // Evidence quality maintained
    expect(compilerEvidence).toBeGreaterThanOrEqual(legacyEvidence);

    console.log("=== COMPILER BENCHMARK VERIFICATION RESULTS ===");
    console.log({
      evaluationTargets: n,
      legacy: {
        avgSearchCalls: avgLegSearch.toFixed(1),
        avgScrapes: avgLegScrapes.toFixed(1),
        avgLlmCalls: avgLegLlm.toFixed(1),
        avgWallTimeMs: Math.round(legacyWallTimeMs / n),
        avgEvidence: (legacyEvidence / n).toFixed(1),
      },
      compiler: {
        avgSearchCalls: avgCompSearch.toFixed(1),
        avgScrapes: avgCompScrapes.toFixed(1),
        avgLlmCalls: avgCompLlm.toFixed(1),
        avgWallTimeMs: Math.round(compilerWallTimeMs / n),
        avgEvidence: (compilerEvidence / n).toFixed(1),
        cacheHits: compilerCacheHits,
      },
      improvements: {
        searchReduction: `-${searchReduction.toFixed(1)}%`,
        scrapeReduction: `-${scrapeReduction.toFixed(1)}%`,
        llmReduction: `-${llmReduction.toFixed(1)}%`,
        wallTimeReduction: `-${wallTimeReduction.toFixed(1)}%`,
      },
    });
  });
});
