"use client";

import dynamic from "next/dynamic";
import type { ObjectMonthScheduleGridProps } from "./object-month-schedule-grid";
import { ObjectMonthScheduleGridSkeleton } from "../ui/page-chunk-skeletons";

const ObjectMonthScheduleGrid = dynamic(
  () => import("./object-month-schedule-grid").then((mod) => mod.ObjectMonthScheduleGrid),
  {
    loading: () => <ObjectMonthScheduleGridSkeleton />,
    ssr: false,
  },
);

export function ObjectMonthScheduleGridLazy(props: ObjectMonthScheduleGridProps) {
  return <ObjectMonthScheduleGrid {...props} />;
}
