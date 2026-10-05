import "server-only";
import { getDb } from "@/lib/db";
import type { SignalAdapter } from "../types";
import { discoverEventSignals, verifyEventSignal } from "./events-core";

/** Event participation → verified event signals (wraps existing event graph). */
export const eventSignalAdapter: SignalAdapter = {
  id: "event",

  async discover(input) {
    return discoverEventSignals(getDb(), input);
  },

  async verify(candidate, input) {
    return verifyEventSignal(candidate, input);
  },
};
