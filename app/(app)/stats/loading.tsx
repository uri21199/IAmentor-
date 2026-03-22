export default function StatsLoading() {
  return (
    <div className="px-4 pt-4 pb-28 space-y-5 max-w-lg mx-auto md:max-w-3xl md:px-6 lg:max-w-4xl">
      {/* Academic progress skeleton */}
      <div>
        <div className="h-4 w-36 rounded-full bg-surface-2 animate-pulse mb-3" />
        <div className="space-y-3 md:grid md:grid-cols-2 md:space-y-0 md:gap-3 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-3xl bg-surface-2 border border-border-subtle p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-surface animate-pulse shrink-0" />
                <div className="h-3.5 flex-1 rounded-full bg-surface animate-pulse" />
                <div className="h-4 w-8 rounded-full bg-surface animate-pulse" />
              </div>
              <div className="h-1.5 w-full rounded-full bg-surface animate-pulse" />
              <div className="flex gap-3">
                <div className="h-3 w-8 rounded-full bg-surface animate-pulse" />
                <div className="h-3 w-8 rounded-full bg-surface animate-pulse" />
                <div className="h-3 w-8 rounded-full bg-surface animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chart skeleton */}
      <div className="rounded-3xl bg-surface-2 border border-border-subtle p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="h-4 w-48 rounded-full bg-surface animate-pulse" />
          <div className="h-5 w-14 rounded-full bg-surface animate-pulse" />
        </div>
        <div className="h-3 w-3/4 rounded-full bg-surface animate-pulse mb-4" />
        <div className="h-[180px] w-full rounded-2xl bg-surface animate-pulse" />
      </div>

      {/* Workout skeleton */}
      <div className="rounded-3xl bg-surface-2 border border-border-subtle p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="h-4 w-28 rounded-full bg-surface animate-pulse" />
          <div className="h-5 w-24 rounded-full bg-surface animate-pulse" />
        </div>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="p-2 rounded-xl bg-background space-y-1.5">
              <div className="h-6 w-6 rounded-full bg-surface-2 animate-pulse mx-auto" />
              <div className="h-4 w-4 rounded-full bg-surface-2 animate-pulse mx-auto" />
              <div className="h-3 w-10 rounded-full bg-surface-2 animate-pulse mx-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
