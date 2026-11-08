import { cn } from '@/lib/cn';

// ─── Skeleton ──────────────────────────────────────────────────────────────────
// Shimmer-animated placeholders that match the shape of real content.
// Use skeleton-shimmer for a premium sweep effect vs plain pulse.

interface SkeletonProps {
  className?: string;
  /** Rounded pill shape — good for badges */
  pill?: boolean;
  /** Full circular avatar shape */
  circle?: boolean;
}

export function Skeleton({ className, pill, circle }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'skeleton-shimmer',
        pill   ? 'rounded-full' :
        circle ? 'rounded-full aspect-square' :
                 'rounded',
        className,
      )}
    />
  );
}

// ─── Pre-wired layout skeletons ────────────────────────────────────────────────

/** Matches a StatsCard */
export function StatsCardSkeleton() {
  return (
    <div className="bg-(--color-surface) rounded-xl border border-(--color-border) p-5 space-y-3" aria-hidden="true">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-2.5 w-20" />
    </div>
  );
}
