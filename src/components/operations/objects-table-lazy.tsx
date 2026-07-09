"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { ObjectsTableChunkSkeleton } from "../ui/page-chunk-skeletons";

const ObjectsTable = dynamic(
  () => import("./objects-table").then((mod) => mod.ObjectsTable),
  {
    loading: () => <ObjectsTableChunkSkeleton />,
    ssr: false,
  },
);

export function ObjectsTableLazy(props: ComponentProps<typeof ObjectsTable>) {
  return <ObjectsTable {...props} />;
}
