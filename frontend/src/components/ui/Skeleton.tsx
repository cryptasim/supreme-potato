export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

export function KpiSkeletonRow({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid gap-3 ${count === 6 ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6' : 'grid-cols-2 lg:grid-cols-4'}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-line bg-surface px-4 py-3.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-28" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 320 }: { height?: number }) {
  return (
    <div role="status" aria-label="Loading chart" style={{ height }} className="flex items-end gap-1.5 pt-6">
      {Array.from({ length: 24 }, (_, i) => (
        <Skeleton key={i} className="flex-1" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
