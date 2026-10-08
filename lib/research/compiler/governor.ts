import { createLogger } from "@/lib/logger";

const log = createLogger("concurrency-governor");

export class AdaptiveConcurrencyGovernor {
  private currentLimit: number;
  private readonly minLimit: number = 1;
  private readonly maxLimit: number;
  private inFlight: number = 0;
  private successStreak: number = 0;
  private latencyEWMA: number = 0;
  private recent429Count: number = 0;
  private recentFailures: number = 0;
  private totalRequests: number = 0;

  constructor(initialLimit: number = 4, maxLimit: number = 8) {
    this.currentLimit = Math.max(1, initialLimit);
    this.maxLimit = Math.max(this.currentLimit, maxLimit);
  }

  getCurrentLimit(): number {
    return this.currentLimit;
  }

  getInFlight(): number {
    return this.inFlight;
  }

  getMetrics() {
    return {
      currentLimit: this.currentLimit,
      inFlight: this.inFlight,
      latencyEWMA: Math.round(this.latencyEWMA),
      recent429Count: this.recent429Count,
      recentFailures: this.recentFailures,
      totalRequests: this.totalRequests,
    };
  }

  async acquireSlot(): Promise<() => void> {
    while (this.inFlight >= this.currentLimit) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    this.inFlight++;
    this.totalRequests++;

    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.inFlight = Math.max(0, this.inFlight - 1);
      }
    };
  }

  recordSuccess(latencyMs: number): void {
    if (this.latencyEWMA === 0) {
      this.latencyEWMA = latencyMs;
    } else {
      this.latencyEWMA = 0.8 * this.latencyEWMA + 0.2 * latencyMs;
    }

    this.successStreak++;
    // AIMD Additive Increase: after 4 consecutive successes, cautiously increase limit
    if (this.successStreak >= 4 && this.currentLimit < this.maxLimit) {
      this.currentLimit = Math.min(this.maxLimit, this.currentLimit + 1);
      this.successStreak = 0;
      log.info("governor: increased concurrency limit", { newLimit: this.currentLimit });
    }
  }

  record429(): void {
    this.recent429Count++;
    this.successStreak = 0;
    // AIMD Multiplicative Decrease: cut concurrency in half
    const prev = this.currentLimit;
    this.currentLimit = Math.max(this.minLimit, Math.ceil(this.currentLimit / 2));
    log.warn("governor: 429 encountered, decreased concurrency limit", {
      prevLimit: prev,
      newLimit: this.currentLimit,
    });
  }

  recordFailure(): void {
    this.recentFailures++;
    this.successStreak = 0;
  }
}

// Global singleton instance for shared Exa execution context
let sharedGovernor: AdaptiveConcurrencyGovernor | undefined;

export function getSharedGovernor(defaultLimit: number = 4): AdaptiveConcurrencyGovernor {
  if (!sharedGovernor) {
    sharedGovernor = new AdaptiveConcurrencyGovernor(defaultLimit, 8);
  }
  return sharedGovernor;
}
