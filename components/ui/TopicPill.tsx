'use client'

import { topicStatusColor, topicStatusIcon } from '@/lib/utils'
import type { Topic, TopicStatus } from '@/types'

interface TopicPillProps {
  topic: Topic
  onStatusChange?: (topicId: string, status: TopicStatus) => void
  compact?: boolean
}

const STATUS_CYCLE: TopicStatus[] = ['red', 'yellow', 'green']

export function TopicPill({ topic, onStatusChange, compact = false }: TopicPillProps) {
  const colorClass = topicStatusColor(topic.status as TopicStatus)
  const icon = topicStatusIcon(topic.status as TopicStatus)

  function handleCycle() {
    if (!onStatusChange) return
    const idx = STATUS_CYCLE.indexOf(topic.status as TopicStatus)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    onStatusChange(topic.id, next)
  }

  if (compact) {
    return (
      <button
        onClick={handleCycle}
        className={`
          inline-flex items-center gap-1 px-2 py-1 rounded-xl border text-xs font-medium
          transition-all duration-200 active:scale-95 min-h-[36px]
          ${colorClass}
        `}
        title={topic.full_description || topic.name}
      >
        <span>{icon}</span>
        <span className="truncate max-w-[120px]">{topic.name}</span>
      </button>
    )
  }

  return (
    <div className={`flex items-center gap-3 p-3 rounded-2xl border ${colorClass}`}>
      <span className="text-xl">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{topic.name}</p>
        {topic.full_description && (
          <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{topic.full_description}</p>
        )}
      </div>
      {onStatusChange && (
        <button
          onClick={handleCycle}
          className="shrink-0 text-xs px-2 py-1 rounded-xl bg-black/20 hover:bg-black/30 transition-all min-h-[36px]"
          aria-label="Cambiar estado"
        >
          Cambiar
        </button>
      )}
    </div>
  )
}
