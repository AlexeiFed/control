import { GuardProfileChunkSkeleton } from "../../../components/ui/page-chunk-skeletons";

export default function GuardDetailsLoading() {
  return (
    <main
      className="min-h-screen bg-app-bg p-3 text-app-text sm:p-6"
      style={{
        paddingTop:
          "calc(0.75rem + var(--incident-banner-offset, 0px) + var(--compliance-banner-offset, 0px))",
      }}
    >
      <GuardProfileChunkSkeleton />
    </main>
  );
}
