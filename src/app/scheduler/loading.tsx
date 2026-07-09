import { SchedulerChunkSkeleton } from "../../components/ui/page-chunk-skeletons";

export default function SchedulerLoading() {
  return (
    <main className="grid min-h-screen gap-6 bg-app-bg p-6 text-app-text">
      <SchedulerChunkSkeleton />
      <div className="animate-pulse rounded-card border border-app-border bg-app-surface p-4">
        <div className="h-40 rounded bg-app-elevated" />
      </div>
    </main>
  );
}
