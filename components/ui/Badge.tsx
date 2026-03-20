import { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'cyan' | 'orange' | 'exam-today'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  const variants: Record<BadgeVariant, string> = {
    default:     'bg-gray-500/20 text-gray-400 border border-gray-500/30',
    primary:     'bg-primary/20 text-primary border border-primary/30',
    success:     'bg-green-500/20 text-green-400 border border-green-500/30',
    warning:     'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    danger:      'bg-red-500/20 text-red-400 border border-red-500/30',
    cyan:        'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
    orange:      'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    'exam-today':'bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold tracking-wide',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
