'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/today',    label: 'Hoy',       emoji: '🗓️' },
  { href: '/checkin',  label: 'Check-in',  emoji: '✅' },
  { href: '/subjects', label: 'Materias',  emoji: '📚' },
  { href: '/gym',      label: 'Gym',       emoji: '💪' },
  { href: '/stats',    label: 'Stats',     emoji: '📊' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur-xl border-t border-border-subtle pb-safe">
      <div className="flex items-center justify-around h-16 px-2 max-w-lg mx-auto">
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl transition-all duration-200 min-w-[56px] min-h-[48px] justify-center',
                isActive
                  ? 'text-primary bg-primary/10'
                  : 'text-text-secondary hover:text-text-primary'
              )}
            >
              <span className={cn('text-xl transition-all', isActive && 'scale-110')}>
                {item.emoji}
              </span>
              <span className={cn('text-[10px] font-medium', isActive ? 'text-primary' : 'text-text-secondary')}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
