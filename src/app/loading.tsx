export default function Loading() {
  return (
    <main className="min-h-screen bg-app-bg p-6 text-app-text">
      <section className="rounded-card border border-app-border bg-app-surface p-6 shadow-glow">
        <div className="h-3 w-40 rounded-full bg-accent-primary/20" />
        <div className="mt-4 h-9 w-72 rounded-button bg-app-elevated" />
        <div className="mt-3 h-4 w-full max-w-xl rounded-full bg-app-elevated" />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-28 rounded-card border border-app-border bg-app-elevated" />
          ))}
        </div>
      </section>
    </main>
  );
}
