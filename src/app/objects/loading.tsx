import { ObjectsTableChunkSkeleton } from "../../components/ui/page-chunk-skeletons";

export default function ObjectsLoading() {
  return (
    <main className="min-h-screen bg-app-bg p-6 text-app-text">
      <ObjectsTableChunkSkeleton />
    </main>
  );
}
