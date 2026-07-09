"use client";

import dynamic from "next/dynamic";
import type { SchedulerGridProps } from "./scheduler-grid";
import { SchedulerChunkSkeleton } from "../ui/page-chunk-skeletons";

const SchedulerGrid = dynamic(
  () => import("./scheduler-grid").then((mod) => mod.SchedulerGrid),
  {
    loading: () => <SchedulerChunkSkeleton />,
    ssr: false,
  },
);

export function SchedulerGridLazy(props: SchedulerGridProps) {
  return <SchedulerGrid {...props} />;
}
