export default function AgendaLoading() {
  return (
    <div className="px-4 pt-4 pb-28 max-w-lg mx-auto md:max-w-2xl md:px-6">
      {/* Filter tabs skeleton */}
      <div className="flex gap-2 mb-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-9 w-20 rounded-2xl bg-surface-2 animate-pulse" />
        ))}
      </div>

      {/* Events skeleton */}
      <div className="space-y-4">
        {[1, 2].map(group => (
          <div key={group}>
            <div className="h-3.5 w-24 rounded-full bg-surface-2 animate-pulse mb-2" />
            <div className="rounded-3xl bg-surface-2 border border-border-subtle overflow-hidden">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle last:border-b-0">
                  <div className="w-9 h-9 rounded-xl bg-surface animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-3/4 rounded-full bg-surface animate-pulse" />
                    <div className="h-3 w-1/2 rounded-full bg-surface animate-pulse" />
                  </div>
                  <div className="h-5 w-16 rounded-full bg-surface animate-pulse shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
