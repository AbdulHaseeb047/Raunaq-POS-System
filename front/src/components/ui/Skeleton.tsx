type SkeletonProps = {
  className?: string;
};

/** Shimmer placeholder for loading states. */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div className={`skeleton-shine rounded-xl bg-surface-muted ${className}`} aria-hidden="true" />
  );
}
