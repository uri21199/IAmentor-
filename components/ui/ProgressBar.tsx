import { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  value: number          // 0-100
  color?: 'primary' | 'green' | 'amber' | 'red' | 'cyan'
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

export function ProgressBar({
  value,
  color = 'primary',
  size = 'md',
  showLabel = false,
  className,
  ...props
}: ProgressBarProps) {
  const colors = {
    primary: 'bg-primary',
    green:   'bg-green-500',
    amber:   'bg-amber-500',
    red:     'bg-red-500',
    cyan:    'bg-cyan-500',
  }

  const heights = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-3.5',
  }

  const clamped = Math.min(100, Math.max(0, value))

  return (
    <div className={cn('w-full', className)} {...props}>
      {showLabel && (
        <div className="flex justify-between text-xs text-text-secondary mb-1">
          <span>Progreso</span>
          <span>{Math.round(clamped)}%</span>
        </div>
      )}
      <div className={cn('w-full bg-surface-2 rounded-full overflow-hidden', heights[size])}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', colors[color])}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}
