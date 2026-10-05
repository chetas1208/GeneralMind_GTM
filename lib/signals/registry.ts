import type { SignalAdapter } from "./types";
import { eventSignalAdapter } from "./adapters/events";
import { hiringSignalAdapter } from "./adapters/hiring";
import { erpSignalAdapter } from "./adapters/erp";
import { executiveChangeSignalAdapter } from "./adapters/executive-change";
import { expansionSignalAdapter } from "./adapters/expansion";
import { operationalInitiativeAdapter } from "./adapters/operations";

const ALL: SignalAdapter[] = [
  eventSignalAdapter,
  hiringSignalAdapter,
  erpSignalAdapter,
  executiveChangeSignalAdapter,
  expansionSignalAdapter,
  operationalInitiativeAdapter,
];

export function getSignalAdapters(filter?: string[]): SignalAdapter[] {
  if (!filter?.length) return ALL;
  const set = new Set(filter);
  return ALL.filter((a) => set.has(a.id));
}
