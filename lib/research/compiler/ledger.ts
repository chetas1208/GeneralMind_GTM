export type ApiLedgerRecord = {
  searchCalls: number;
  scrapeCalls: number;
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheHits: number;
  cacheMisses: number;
  searchesAvoided: number;
  wallTimeMs: number;
};

export class ApiLedger {
  private record: ApiLedgerRecord;
  private readonly startAt: number;

  constructor() {
    this.startAt = Date.now();
    this.record = {
      searchCalls: 0,
      scrapeCalls: 0,
      llmCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheHits: 0,
      cacheMisses: 0,
      searchesAvoided: 0,
      wallTimeMs: 0,
    };
  }

  recordSearch(fromCache: boolean = false): void {
    if (fromCache) {
      this.record.cacheHits++;
    } else {
      this.record.searchCalls++;
      this.record.cacheMisses++;
    }
  }

  recordScrape(fromCache: boolean = false): void {
    if (fromCache) {
      this.record.cacheHits++;
    } else {
      this.record.scrapeCalls++;
      this.record.cacheMisses++;
    }
  }

  recordLLM(inputTokens: number = 0, outputTokens: number = 0): void {
    this.record.llmCalls++;
    this.record.inputTokens += inputTokens;
    this.record.outputTokens += outputTokens;
  }

  recordAvoidedSearches(count: number): void {
    this.record.searchesAvoided += count;
  }

  finish(): ApiLedgerRecord & { efficiencyMetrics: Record<string, number | string> } {
    this.record.wallTimeMs = Date.now() - this.startAt;
    const totalRequests = this.record.cacheHits + this.record.cacheMisses;
    const cacheReusePct = totalRequests > 0 ? Math.round((this.record.cacheHits / totalRequests) * 100) : 0;

    return {
      ...this.record,
      efficiencyMetrics: {
        cacheReusePct: `${cacheReusePct}%`,
        searchesAvoidedByPolicy: this.record.searchesAvoided,
        totalLLMCalls: this.record.llmCalls,
        totalTokens: this.record.inputTokens + this.record.outputTokens,
        wallTimeSeconds: (this.record.wallTimeMs / 1000).toFixed(2),
      },
    };
  }
}
