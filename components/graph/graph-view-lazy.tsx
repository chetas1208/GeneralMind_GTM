"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/** React Flow + dagre load only when a graph is actually shown, keeping them out of the page's first-load JS. */
export const GraphView = dynamic(() => import("./graph-view").then((m) => m.GraphView), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full rounded-xl" />,
});
