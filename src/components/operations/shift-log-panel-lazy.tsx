"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const ShiftLogPanel = dynamic(
  () => import("./shift-log-panel").then((mod) => mod.ShiftLogPanel),
  {
    loading: () => (
      <div className="animate-pulse rounded-card border border-app-border bg-app-surface p-4">
        <div className="mb-3 h-6 w-40 rounded bg-app-elevated" />
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-10 rounded bg-app-elevated" />
          ))}
        </div>
      </div>
    ),
    ssr: false,
  },
);

export function ShiftLogPanelLazy(props: ComponentProps<typeof ShiftLogPanel>) {
  return <ShiftLogPanel {...props} />;
}
