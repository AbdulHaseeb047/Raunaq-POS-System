type SkeletonShimmerProps = {
  className?: string;
};

/**
 * Glossy skeleton placeholder with a diagonal light-sweep animation.
 * Use for page/table/card/chart loading states across the app.
 */
export function SkeletonShimmer({ className = '' }: SkeletonShimmerProps) {
  return (
    <div className={`skeleton-shine rounded-xl bg-surface-muted ${className}`} aria-hidden="true" />
  );
}

/** @deprecated Prefer SkeletonShimmer — alias kept for existing call sites. */
export function Skeleton({ className = '' }: SkeletonShimmerProps) {
  return <SkeletonShimmer className={className} />;
}
