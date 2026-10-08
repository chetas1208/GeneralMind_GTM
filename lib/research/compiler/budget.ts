import type { ResearchBudget } from "./types";

export class BudgetTracker {
  private readonly budget: ResearchBudget;
  private readonly startTime: number;
  private searchesUsed: number = 0;
  private scrapesUsed: number = 0;
  private llmCallsUsed: number = 0;
  private tokensUsed: number = 0;

  constructor(budget: ResearchBudget) {
    this.budget = budget;
    this.startTime = Date.now();
  }

  canSearch(): boolean {
    return this.searchesUsed < this.budget.maxSearchCalls && !this.isTimeExceeded();
  }

  canScrape(): boolean {
    return this.scrapesUsed < this.budget.maxScrapes && !this.isTimeExceeded();
  }

  canCallLLM(): boolean {
    return (
      this.llmCallsUsed < this.budget.maxLLMCalls &&
      this.tokensUsed < this.budget.maxTokens &&
      !this.isTimeExceeded()
    );
  }

  recordSearch(): void {
    this.searchesUsed++;
  }

  recordScrape(): void {
    this.scrapesUsed++;
  }

  recordLLM(inputTokens: number = 0, outputTokens: number = 0): void {
    this.llmCallsUsed++;
    this.tokensUsed += inputTokens + outputTokens;
  }

  isTimeExceeded(): boolean {
    return Date.now() - this.startTime >= this.budget.maxWallTimeMs;
  }

  isExhausted(): boolean {
    return (
      !this.canSearch() &&
      !this.canScrape() &&
      !this.canCallLLM()
    );
  }

  getUsage() {
    return {
      searchesUsed: this.searchesUsed,
      searchesRemaining: Math.max(0, this.budget.maxSearchCalls - this.searchesUsed),
      scrapesUsed: this.scrapesUsed,
      scrapesRemaining: Math.max(0, this.budget.maxScrapes - this.scrapesUsed),
      llmCallsUsed: this.llmCallsUsed,
      llmCallsRemaining: Math.max(0, this.budget.maxLLMCalls - this.llmCallsUsed),
      tokensUsed: this.tokensUsed,
      elapsedMs: Date.now() - this.startTime,
      timeRemainingMs: Math.max(0, this.budget.maxWallTimeMs - (Date.now() - this.startTime)),
    };
  }
}
