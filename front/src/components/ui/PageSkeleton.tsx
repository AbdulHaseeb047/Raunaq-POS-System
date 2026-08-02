import { SkeletonShimmer } from '@/components/ui/Skeleton';

/** Full-page shimmer placeholders while route data loads. */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <SkeletonShimmer className="h-7 w-48" />
        <SkeletonShimmer className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SkeletonShimmer className="h-24 rounded-2xl" />
        <SkeletonShimmer className="h-24 rounded-2xl" />
        <SkeletonShimmer className="h-24 rounded-2xl" />
        <SkeletonShimmer className="h-24 rounded-2xl" />
      </div>
      <div className="space-y-2 rounded-2xl border border-border bg-surface p-4">
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonShimmer key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonShimmer key={i} className="h-11 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i}>
          <SkeletonShimmer className="h-12 w-full rounded-xl" />
        </li>
      ))}
    </ul>
  );
}
