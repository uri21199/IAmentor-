'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import SideDrawer from './SideDrawer'
import NotificationCenter from '@/components/features/NotificationCenter'

const PAGE_TITLES: Record<string, string> = {
  '/today':          'Hoy',
  '/checkin':        'Check-in',
  '/subjects':       'Materias',
  '/gym':            'Gym',
  '/stats':          'Estadísticas',
  '/trabajo':        'Horario laboral',
  '/cursada':        'Cursada',
  '/cuatrimestres':  'Cuatrimestres',
  '/settings':       'Configuración',
  '/agenda':         'Agenda',
  '/calendar':       'Calendario',
  '/notifications':  'Notificaciones',
}

interface AppShellProps {
  children: React.ReactNode
  userEmail?: string
}

export default function AppShell({ children, userEmail }: AppShellProps) {
  const [drawerOpen, setDrawerOpen]           = useState(false)
  const [notifUnreadCount, setNotifUnreadCount] = useState(0)
  const pathname = usePathname()

  const title = Object.entries(PAGE_TITLES).find(([k]) =>
    pathname === k || pathname.startsWith(k + '/')
  )?.[1] ?? 'Mentor IA'

  return (
    <>
      <SideDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userEmail={userEmail}
        notificationUnreadCount={notifUnreadCount}
      />

      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur-xl border-b border-border-subtle">
        <div className="flex items-center gap-3 h-14 px-4 max-w-lg mx-auto">
          <button
            onClick={() => setDrawerOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
            aria-label="Abrir menú"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="flex-1 text-base font-semibold text-text-primary">{title}</h1>
          <NotificationCenter onUnreadCountChange={setNotifUnreadCount} />
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">
        {children}
      </main>
    </>
  )
}
