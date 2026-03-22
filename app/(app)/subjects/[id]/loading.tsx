export default function SubjectDetailLoading() {
  return (
    <div className="px-4 pt-4 pb-28 space-y-5 max-w-lg mx-auto md:max-w-3xl md:px-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-surface-2 animate-pulse shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-4 w-40 rounded-full bg-surface-2 animate-pulse" />
          <div className="h-2 w-24 rounded-full bg-surface-2 animate-pulse" />
        </div>
      </div>

      {/* Events section skeleton */}
      <div className="rounded-3xl bg-surface-2 border border-border-subtle overflow-hidden">
        {[1, 2].map(i => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle last:border-b-0">
            <div className="w-2 h-2 rounded-full bg-surface animate-pulse shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="h-3.5 w-2/3 rounded-full bg-surface animate-pulse" />
              <div className="h-3 w-1/3 rounded-full bg-surface animate-pulse" />
            </div>
            <div className="h-5 w-12 rounded-full bg-surface animate-pulse" />
          </div>
        ))}
      </div>

      {/* Units skeleton */}
      <div className="space-y-4">
        <div className="h-4 w-20 rounded-full bg-surface-2 animate-pulse" />
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-3">
              <div className="w-3.5 h-3.5 rounded bg-surface animate-pulse shrink-0" />
              <div className="h-3.5 flex-1 rounded-full bg-surface animate-pulse" />
              <div className="h-3 w-12 rounded-full bg-surface animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
