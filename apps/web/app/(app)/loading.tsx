import { LoadingRegion, Skeleton, SkeletonCard } from "@/components/ui/skeleton";

/**
 * Shown for every route in the app shell while its page renders.
 *
 * These screens read the Databricks warehouse, whose statements were measured
 * at roughly a second warm and considerably worse cold, so without this the
 * browser sat on the previous route — or on nothing at all — until the slowest
 * query returned. The nav, ticker and footer come from the layout and stay put;
 * only the page area below is replaced.
 *
 * Note that the layout itself resolves the session before any of this renders:
 * a layout reading runtime data is not covered by a `loading.tsx` in its own
 * segment. That is why `/journey` also places boundaries around its individual
 * sections rather than relying on this file alone.
 */
export default function Loading() {
  return (
    <LoadingRegion label="Loading">
      <div className="mx-auto max-w-[1400px]">
        <section className="border-b-2 border-ink px-5 py-12">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-5 h-[clamp(2.2rem,7vw,5rem)] w-[min(28ch,90%)]" />
          <Skeleton className="mt-6 h-3.5 w-[min(52ch,100%)]" />
          <Skeleton className="mt-2 h-3.5 w-[min(38ch,90%)]" />
        </section>

        <section className="px-5 py-9">
          <Skeleton className="h-3 w-40" />
          <div className="mt-7 grid gap-5 lg:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </section>
      </div>
    </LoadingRegion>
  );
}
