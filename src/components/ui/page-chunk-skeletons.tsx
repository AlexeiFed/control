/** Скелетоны для lazy-chunks тяжёлых client-компонентов (без обёртки main). */

export function ObjectDetailChunkSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-8 w-64 rounded bg-app-elevated" />
      <div className="mb-4 h-4 w-96 max-w-full rounded bg-app-elevated" />
      <div className="rounded-card border border-app-border bg-app-surface p-6">
        <div className="mb-4 h-6 w-48 rounded bg-app-elevated" />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="h-32 rounded bg-app-elevated" />
          <div className="h-32 rounded bg-app-elevated" />
        </div>
        <div className="mt-6 h-64 rounded bg-app-elevated" />
      </div>
    </div>
  );
}

export function SchedulerChunkSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-10 w-72 rounded bg-app-elevated" />
      <div className="mt-6 rounded-card border border-app-border bg-app-surface p-4">
        <div className="mb-4 h-6 w-40 rounded bg-app-elevated" />
        <div className="h-[28rem] rounded bg-app-elevated" />
      </div>
    </div>
  );
}

export function GuardsChunkSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-8 w-56 rounded bg-app-elevated" />
      <div className="mb-4 flex gap-3">
        <div className="h-10 w-48 rounded bg-app-elevated" />
        <div className="h-10 w-36 rounded bg-app-elevated" />
      </div>
      <div className="rounded-card border border-app-border bg-app-surface p-4">
        <div className="space-y-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-12 rounded bg-app-elevated" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ObjectsTableChunkSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded bg-app-elevated" />
      <div className="rounded-card border border-app-border bg-app-surface p-4">
        <div className="space-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-14 rounded bg-app-elevated" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ObjectMonthScheduleGridSkeleton() {
  return (
    <section className="animate-pulse rounded-card border border-app-border bg-app-surface p-6 shadow-glow">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-6 w-40 rounded bg-app-elevated" />
        <div className="h-8 w-48 rounded bg-app-elevated" />
      </div>
      <div className="h-[24rem] rounded bg-app-elevated" />
    </section>
  );
}
