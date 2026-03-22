'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase'
import SideDrawer, { NAV_SECTIONS } from './SideDrawer'

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
  '/weekly':         'Plan semanal',
  '/calendar':       'Calendario',
  '/notifications':  'Notificaciones',
}

interface AppShellProps {
  children: React.ReactNode
  userEmail?: string
  notificationUnreadCount?: number
}

export default function AppShell({ children, userEmail, notificationUnreadCount = 0 }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const title = Object.entries(PAGE_TITLES).find(([k]) =>
    pathname === k || pathname.startsWith(k + '/')
  )?.[1] ?? 'Mentor IA'

  const todaySubtitle = pathname === '/today'
    ? (() => {
        const d = format(new Date(), "EEE d 'de' MMM", { locale: es })
        return d.charAt(0).toUpperCase() + d.slice(1)
      })()
    : null

  // Scroll lock cuando el drawer está abierto en mobile
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      {/* ── Mobile Drawer ────────────────────────────────────────────────── */}
      <SideDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        userEmail={userEmail}
        notificationUnreadCount={notificationUnreadCount}
      />

      {/* ── Desktop Sidebar (md+) ────────────────────────────────────────── */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-64 bg-surface border-r border-border-subtle z-20">
        {/* Sidebar header */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-border-subtle shrink-0">
          <div className="w-7 h-7 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-text-primary leading-none">Mentor IA</p>
            {userEmail && (
              <p className="text-[11px] text-text-secondary mt-0.5 truncate">{userEmail}</p>
            )}
          </div>
        </div>

        {/* Sidebar nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {NAV_SECTIONS.map((section, si) => (
            <div key={si} className={si > 0 ? 'mt-5' : ''}>
              {section.label && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-secondary">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map(item => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all duration-150',
                        isActive
                          ? 'bg-primary/15 text-primary'
                          : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                      )}
                    >
                      <span className={cn('shrink-0', isActive ? 'text-primary' : 'text-text-secondary')}>
                        {item.icon}
                      </span>
                      {item.label}
                      {isActive && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="px-4 py-4 border-t border-border-subtle space-y-2">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Cerrar sesión
          </button>
          <p className="text-[10px] text-text-secondary text-center">Mentor IA — v2.0</p>
        </div>
      </aside>

      {/* ── Content area ─────────────────────────────────────────────────── */}
      <div className="md:pl-64 flex flex-col min-h-dvh">

        {/* Mobile top bar (hidden on md+) */}
        <header
          className="sticky top-0 z-30 bg-surface/95 backdrop-blur-xl border-b border-border-subtle md:hidden"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="flex items-center gap-3 h-14 px-4">
            <button
              onClick={() => setDrawerOpen(true)}
              className="w-11 h-11 flex items-center justify-center rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors -ml-1"
              aria-label="Abrir menú"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="flex-1 text-base font-semibold text-text-primary">
              {title}
              {todaySubtitle && (
                <span className="text-xs font-normal text-text-secondary ml-2">{todaySubtitle}</span>
              )}
            </h1>
          </div>
        </header>

        {/* Desktop top bar (hidden on mobile) */}
        <header className="hidden md:flex sticky top-0 z-30 bg-surface/95 backdrop-blur-xl border-b border-border-subtle">
          <div className="flex items-center h-16 px-8 w-full">
            <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </>
  )
}
