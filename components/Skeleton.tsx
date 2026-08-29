// ============================================
// Loading skeletons — the page's shape, before its data
// ============================================
// The four heaviest pages (analytics, calendar, receipts, financial
// reports) took 1–4.5 seconds to first content and spent that time on a
// centered spinner — a blank screen with a pinwheel, which the audit filed
// as "bare Loading... placeholders; no skeletons or error states"
// (AUT-H03). A skeleton in the page's own layout tells the user the page is
// coming AND what it will look like, and reads as faster for the same wait.
//
// Primitives only, composed per page next to each page's real layout — a
// skeleton that mirrors a stale copy of the layout is worse than a spinner,
// so each page owns its composition and keeps it beside the markup it
// mimics.

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-gray-200 ${className}`} />
}

/** A row of stat tiles — the header of every financial page. */
export function SkeletonStatCards({ count = 4, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`grid gap-4 ${className}`} style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
          <Skeleton className="h-3 w-1/2 mb-3" />
          <Skeleton className="h-7 w-2/3" />
        </div>
      ))}
    </div>
  )
}

/** A table: header band plus rows. */
export function SkeletonTable({ rows = 8, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${className}`}>
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
        <Skeleton className="h-3 w-1/3" />
      </div>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="px-4 py-3.5 flex items-center gap-4">
            <Skeleton className="h-4 w-1/6" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/5" />
            <Skeleton className="h-4 w-1/6 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** A chart panel: title line over a tall block. */
export function SkeletonChart({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}>
      <Skeleton className="h-4 w-1/3 mb-4" />
      <Skeleton className="h-56 w-full" />
    </div>
  )
}

/** A month grid — seven columns, five weeks. */
export function SkeletonCalendarGrid({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${className}`}>
      <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="px-2 py-2">
            <Skeleton className="h-3 w-8 mx-auto" />
          </div>
        ))}
      </div>
      {Array.from({ length: 5 }, (_, w) => (
        <div key={w} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
          {Array.from({ length: 7 }, (_, d) => (
            <div key={d} className="h-24 p-2 border-r border-gray-100 last:border-r-0">
              <Skeleton className="h-3 w-5 mb-2" />
              {(w * 7 + d) % 3 === 0 && <Skeleton className="h-4 w-full" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** The page title band. */
export function SkeletonPageHeader({ className = '' }: { className?: string }) {
  return (
    <div className={className}>
      <Skeleton className="h-7 w-48 mb-2" />
      <Skeleton className="h-4 w-72" />
    </div>
  )
}
