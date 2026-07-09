export default function Loading() {
  return (
    <main className="min-h-screen bg-app-bg p-6 text-app-text">
      <section className="rounded-card border border-app-border bg-app-surface p-6 shadow-glow">
        <div
          role="status"
          aria-live="polite"
          className="mb-6 flex items-center gap-3 rounded-card border border-accent-primary/40 bg-accent-primary/10 px-4 py-3 text-sm text-accent-primary"
        >
          <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-accent-primary" />
          <span className="font-semibold">
            Загружаем табель смен… собираем часы, ставки и инциденты за выбранный период.
          </span>
        </div>

        <div className="h-3 w-40 rounded-full bg-accent-primary/20" />
        <div className="mt-4 h-9 w-72 rounded-button bg-app-elevated" />
        <div className="mt-3 h-4 w-full max-w-xl rounded-full bg-app-elevated" />

        <div className="mt-8 grid gap-3 rounded-card border border-app-border bg-app-elevated p-4 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-10 rounded-button bg-app-bg" />
          ))}
        </div>

        <div className="mt-8 overflow-hidden rounded-card border border-app-border">
          <div className="h-12 bg-app-elevated" />
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="h-12 border-t border-app-border bg-app-surface" />
          ))}
        </div>
      </section>
    </main>
  );
}
