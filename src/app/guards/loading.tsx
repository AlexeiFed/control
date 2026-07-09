import { GuardsChunkSkeleton } from "../../components/ui/page-chunk-skeletons";

export default function GuardsLoading() {
  return (
    <main
      className="min-h-screen bg-app-bg p-6 text-app-text"
      style={{
        paddingTop:
          "calc(1.5rem + var(--incident-banner-offset, 0px) + var(--compliance-banner-offset, 0px))",
      }}
    >
      <GuardsChunkSkeleton />
    </main>
  );
}
