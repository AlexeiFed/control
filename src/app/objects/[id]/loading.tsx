import { ObjectDetailChunkSkeleton } from "../../../components/ui/page-chunk-skeletons";

export default function ObjectDetailLoading() {
  return (
    <main className="min-h-screen bg-app-bg p-6 text-app-text">
      <ObjectDetailChunkSkeleton />
    </main>
  );
}
