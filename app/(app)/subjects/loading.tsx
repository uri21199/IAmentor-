export default function SubjectsLoading() {
  return (
    <div className="px-4 pt-4 pb-28 max-w-lg mx-auto md:max-w-2xl md:px-6 space-y-4">
      <div className="h-5 w-40 rounded-full bg-surface-2 animate-pulse" />
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="rounded-3xl bg-surface-2 border border-border-subtle p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-3 h-3 rounded-full bg-surface animate-pulse shrink-0" />
            <div className="h-4 flex-1 rounded-full bg-surface animate-pulse" />
            <div className="h-5 w-10 rounded-full bg-surface animate-pulse" />
          </div>
          <div className="h-1.5 w-full rounded-full bg-surface animate-pulse mb-2" />
          <div className="flex gap-2">
            <div className="h-3 w-12 rounded-full bg-surface animate-pulse" />
            <div className="h-3 w-12 rounded-full bg-surface animate-pulse" />
            <div className="h-3 w-12 rounded-full bg-surface animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}
