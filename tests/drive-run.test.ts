import { beforeEach, describe, expect, it, vi } from "vitest";
import { NonRetriableError } from "inngest";

const getRun = vi.fn();
const markRunCancelled = vi.fn();
const tickRun = vi.fn();

vi.mock("@/lib/db/queries/runs", () => ({
  getRun: (...a: unknown[]) => getRun(...a),
  markRunCancelled: (...a: unknown[]) => markRunCancelled(...a),
  isTerminal: (s: string) => ["complete", "failed", "cancelled"].includes(s),
}));
vi.mock("@/lib/pipeline/runner", () => ({ tickRun: (...a: unknown[]) => tickRun(...a) }));

import { driveRun } from "@/lib/inngest/drive-run";
import { ConfigError } from "@/lib/env";
import { IntegrationError } from "@/lib/http";

/** Stand-in for Inngest step tools: executes each step immediately and records its id. */
function fakeStep() {
  const ids: string[] = [];
  const step = {
    run: async (id: string, fn: () => unknown) => {
      ids.push(id);
      return fn();
    },
    sleep: async (id: string) => {
      ids.push(id);
    },
  };
  return { step: step as never, ids };
}

const row = (status: string, stage: string, extra: object = {}) => ({ id: "r1", status, stage, leaseUntil: null, ...extra });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("driveRun (durable step loop)", () => {
  it("advances in named steps until the run completes", async () => {
    getRun.mockResolvedValue(row("queued", "queued"));
    tickRun
      .mockResolvedValueOnce(row("running", "qualifying"))
      .mockResolvedValueOnce(row("running", "finding_people"))
      .mockResolvedValueOnce(row("complete", "complete"));
    const { step, ids } = fakeStep();
    const final = await driveRun(step, "r1");
    expect(final.status).toBe("complete");
    expect(ids).toEqual(["load-run", "advance-queued-0", "advance-qualifying-1", "advance-finding_people-2"]);
    expect(tickRun).toHaveBeenCalledTimes(3);
  });

  it("honours cancel_requested at a step boundary without ticking", async () => {
    getRun.mockResolvedValue(row("cancel_requested", "extracting"));
    const { step } = fakeStep();
    const final = await driveRun(step, "r1");
    expect(markRunCancelled).toHaveBeenCalledWith("r1");
    expect(tickRun).not.toHaveBeenCalled();
    expect(final.status).toBe("cancelled");
  });

  it("lets transient errors propagate so Inngest retries only that step", async () => {
    getRun.mockResolvedValue(row("running", "enriching"));
    tickRun.mockRejectedValue(new IntegrationError("apollo", "rate_limit", "HTTP 429", 429));
    const { step } = fakeStep();
    await expect(driveRun(step, "r1")).rejects.toBeInstanceOf(IntegrationError);
    expect(tickRun).toHaveBeenCalledWith("r1", expect.objectContaining({ rethrow: true }));
  });

  it.each([
    ["config", () => new ConfigError("APOLLO_API_KEY is not set", "APOLLO_API_KEY")],
    ["401", () => new IntegrationError("exa", "auth", "HTTP 401", 401)],
    ["400", () => new IntegrationError("exa", "bad_request", "HTTP 400", 400)],
  ])("does not retry permanent failures (%s)", async (_n, make) => {
    getRun.mockResolvedValue(row("running", "enriching"));
    tickRun.mockRejectedValue(make());
    const { step } = fakeStep();
    await expect(driveRun(step, "r1")).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("waits instead of spinning when another worker holds the lease", async () => {
    getRun.mockResolvedValue(row("running", "scoring"));
    tickRun
      .mockResolvedValueOnce(row("running", "scoring", { leaseUntil: new Date(Date.now() + 60_000) }))
      .mockResolvedValueOnce(row("complete", "complete"));
    const { step, ids } = fakeStep();
    await driveRun(step, "r1");
    expect(ids).toContain("wait-for-lease-0");
  });
});
