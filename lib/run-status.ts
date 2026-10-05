/** Run states shared by server pages and client components (no server-only imports). */
export type RunStatus = "queued" | "running" | "cancel_requested" | "complete" | "failed" | "cancelled";

export const isActiveStatus = (s: string): boolean => s === "queued" || s === "running" || s === "cancel_requested";
