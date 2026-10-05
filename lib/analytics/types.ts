export type MomentumPoint = {
  date: string;
  momentum: number;
  quality: number;
  volume: number;
  driver: string;
};

export type MomentumSeries = {
  range: "7" | "30" | "90";
  points: MomentumPoint[];
  current: number;
  previous: number;
  deltaPct: number | null;
  historyNote: string | null;
  earliest: string | null;
};

export type FunnelStage = {
  key: string;
  label: string;
  count: number;
  href?: string;
};

export type MomentumDriver = {
  direction: "up" | "down";
  contribution: number;
  title: string;
  detail: string;
  href?: string;
};

export type ActivityItem = {
  id: string;
  type: string;
  title: string;
  description: string;
  occurredAt: string;
  href?: string;
};

export type NextAction = {
  title: string;
  detail: string;
  href: string;
  cta: string;
};
