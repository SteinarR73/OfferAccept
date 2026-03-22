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
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3" aria-hidden="true">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-2.5 w-20" />
    </div>
  );
}

/** Matches an OfferTable row */
export function OfferRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0" aria-hidden="true">
      <Skeleton className="h-4 flex-1 max-w-[180px]" />
      <Skeleton className="h-3 w-32 hidden sm:block" />
      <Skeleton className="h-5 w-16 rounded-full" pill />
      <Skeleton className="h-3 w-20 hidden md:block" />
    </div>
  );
}

/** Replaces a loading table body */
export function OfferTableBodySkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-label="Loading offers" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <OfferRowSkeleton key={i} />
      ))}
    </div>
  );
}

/** Matches the ActivityFeed */
export function ActivityItemSkeleton() {
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 last:border-0" aria-hidden="true">
      <Skeleton circle className="w-2 h-2 flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-2.5 w-16" />
      </div>
      <Skeleton className="h-4 w-14" pill />
    </div>
  );
}

/** Matches the DeliveryTimeline */
export function DeliveryItemSkeleton() {
  return (
    <div className="flex items-start gap-3" aria-hidden="true">
      <Skeleton circle className="w-2 h-2 flex-shrink-0 mt-1.5" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-2.5 w-40" />
        <Skeleton className="h-2 w-24" />
      </div>
      <Skeleton className="h-4 w-14" pill />
    </div>
  );
}
