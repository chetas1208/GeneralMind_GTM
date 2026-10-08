import { beforeEach, describe, expect, it, vi } from "vitest";

const q = {
  acquireLease: vi.fn(),
  getRun: vi.fn(),
  getRunStatus: vi.fn(),
  finalizeRunCancelled: vi.fn(),
  saveRun: vi.fn(),
};
vi.mock("@/lib/db/queries/runs", () => ({
  acquireLease: (...a: unknown[]) => q.acquireLease(...a),
  getRun: (...a: unknown[]) => q.getRun(...a),
  getRunStatus: (...a: unknown[]) => q.getRunStatus(...a),
  finalizeRunCancelled: (...a: unknown[]) => q.finalizeRunCancelled(...a),
  saveRun: (...a: unknown[]) => q.saveRun(...a),
  createRun: vi.fn(),
  findActiveRun: vi.fn(),
  reclaimStaleActiveRun: vi.fn(),
}));
const handler = vi.fn();
vi.mock("@/lib/pipeline/discovery", () => ({ discoveryStep: (...a: unknown[]) => handler(...a) }));
vi.mock("@/lib/pipeline/sourcing", () => ({ sourcingStep: vi.fn() }));

import { tickRun } from "@/lib/pipeline/runner";

const run = (status: string, extra: object = {}) => ({
  id: "r1", kind: "event_discovery", eventId: null, status, stage: "extracting", leaseUntil: null, progress: { steps: [], cursor: {}, counters: {} },
  eventsFound: 0, companiesFound: 0, peopleFound: 0, peopleEnriched: 0, leadsQualified: 0, ...extra,
});

beforeEach(() => vi.resetAllMocks());

describe("cooperative cancellation (shared by Inngest and /tick)", () => {
  it("/tick finalizes a cancel_requested run whose worker is gone", async () => {
    q.acquireLease.mockResolvedValue(null);
    q.getRun.mockResolvedValue(run("cancel_requested"));
    await tickRun("r1");
    expect(q.finalizeRunCancelled).toHaveBeenCalledWith("r1");
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not finalize while another worker still holds the lease", async () => {
    q.acquireLease.mockResolvedValue(null);
    q.getRun.mockResolvedValue(run("cancel_requested", { leaseUntil: new Date(Date.now() + 30_000), updatedAt: new Date() }));
    await tickRun("r1");
    expect(q.finalizeRunCancelled).not.toHaveBeenCalled();
  });

  it("finalizes if cancel_requested has timed out even if lease is still stamped", async () => {
    q.acquireLease.mockResolvedValue(null);
    q.getRun.mockResolvedValue(run("cancel_requested", { leaseUntil: new Date(Date.now() + 30_000), updatedAt: new Date(Date.now() - 25_000) }));
    await tickRun("r1");
    expect(q.finalizeRunCancelled).toHaveBeenCalledWith("r1");
  });

  it("stops after the in-flight batch instead of starting another", async () => {
    q.acquireLease.mockResolvedValue(run("running"));
    q.getRun.mockResolvedValue(run("cancelled"));
    q.getRunStatus.mockResolvedValueOnce("running").mockResolvedValue("cancel_requested");
    handler.mockResolvedValue("continue");
    await tickRun("r1", { budgetMs: 300_000 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(q.finalizeRunCancelled).toHaveBeenCalledWith("r1");
  });

  it("cancels before the first batch when already requested", async () => {
    q.acquireLease.mockResolvedValue(run("running"));
    q.getRun.mockResolvedValue(run("cancelled"));
    q.getRunStatus.mockResolvedValue("cancel_requested");
    await tickRun("r1");
    expect(handler).not.toHaveBeenCalled();
    expect(q.finalizeRunCancelled).toHaveBeenCalledWith("r1");
  });
});
