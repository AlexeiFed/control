"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { GuardsChunkSkeleton } from "../ui/page-chunk-skeletons";

const GuardFilters = dynamic(
  () => import("./guard-filters").then((mod) => mod.GuardFilters),
  {
    loading: () => <GuardsChunkSkeleton />,
    ssr: false,
  },
);

export function GuardFiltersLazy(props: ComponentProps<typeof GuardFilters>) {
  return <GuardFilters {...props} />;
}
