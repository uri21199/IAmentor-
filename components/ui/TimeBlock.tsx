'use client'

import { useState } from 'react'
import { cn, blockTypeColor, blockTypeIcon } from '@/lib/utils'
import type { TimeBlock as TimeBlockType } from '@/types'

interface TimeBlockProps {
  block: TimeBlockType
  onToggle?: (id: string, completed: boolean) => void
  onPress?: (block: TimeBlockType) => void
}

export function TimeBlock({ block, onToggle, onPress }: TimeBlockProps) {
  const [localCompleted, setLocalCompleted] = useState(block.completed)

  const colorClass = blockTypeColor(block.type)
  const icon = blockTypeIcon(block.type)

  const priorityBadge =
    block.priority === 'exam'   ? '🆘' :
    block.priority === 'high'   ? '🔴' :
    block.priority === 'medium' ? '🟡' :
    null

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation()
    const next = !localCompleted
    setLocalCompleted(next)
    onToggle?.(block.id, next)
  }

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 p-3 rounded-2xl border transition-all duration-200 cursor-pointer',
        colorClass,
        localCompleted && 'opacity-50 line-through',
        'active:scale-[0.98]'
      )}
      onClick={() => onPress?.(block)}
    >
      {/* Time column */}
      <div className="flex flex-col items-center min-w-[52px] shrink-0">
        <span className="text-xs font-medium opacity-80">{block.start_time}</span>
        <div className="w-px h-3 bg-current opacity-30 my-0.5" />
        <span className="text-xs opacity-60">{block.end_time}</span>
      </div>

      {/* Icon */}
      <span className="text-lg shrink-0 mt-0.5">{icon}</span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <p className="text-sm font-semibold text-text-primary truncate">{block.title}</p>
          {priorityBadge && <span className="text-xs">{priorityBadge}</span>}
        </div>
        {block.description && (
          <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{block.description}</p>
        )}
      </div>

      {/* Completion checkbox */}
      {onToggle && (
        <button
          onClick={handleToggle}
          className={cn(
            'shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
            localCompleted
              ? 'border-green-400 bg-green-400/20'
              : 'border-current opacity-40 hover:opacity-70'
          )}
          aria-label={localCompleted ? 'Marcar como pendiente' : 'Marcar como completado'}
        >
          {localCompleted && (
            <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
      )}
    </div>
  )
}
