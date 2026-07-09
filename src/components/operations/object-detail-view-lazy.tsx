"use client";

import dynamic from "next/dynamic";
import type { ObjectDetailViewProps } from "./object-detail-view";
import { ObjectDetailChunkSkeleton } from "../ui/page-chunk-skeletons";

const ObjectDetailView = dynamic(
  () => import("./object-detail-view").then((mod) => mod.ObjectDetailView),
  {
    loading: () => <ObjectDetailChunkSkeleton />,
    ssr: false,
  },
);

export function ObjectDetailViewLazy(props: ObjectDetailViewProps) {
  return <ObjectDetailView {...props} />;
}
