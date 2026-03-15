'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { AppNotification, NotificationType } from '@/types'

// ── Type metadata (icon + urgency color) ──────────────────────────────────────

const TYPE_META: Record<NotificationType, { icon: string; color: string }> = {
  exam_today:            { icon: '🚨', color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  exam_approaching:      { icon: '🎯', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  deadline_approaching:  { icon: '📋', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  exam_alert:            { icon: '🎯', color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  post_class:            { icon: '📚', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
  energy_boost:          { icon: '⚡', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  early_win:             { icon: '✨', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
}

// ── Bell icon with badge ───────────────────────────────────────────────────────

interface BellProps {
  unreadCount: number
  onClick: () => void
}

export function NotificationBell({ unreadCount, onClick }: BellProps) {
  return (
    <button
      onClick={onClick}
      className="relative w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
      aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  )
}

// ── Single notification row ────────────────────────────────────────────────────

interface NotifRowProps {
  n: AppNotification
  onTap: (n: AppNotification) => void
  onMarkRead: (id: string) => void
}

function NotifRow({ n, onTap, onMarkRead }: NotifRowProps) {
  const meta      = TYPE_META[n.type] ?? TYPE_META.early_win
  const timeAgo   = formatDistanceToNow(parseISO(n.triggered_at), { addSuffix: true, locale: es })
  const displayTitle = n.title ?? n.message
  const displayBody  = n.body  ?? null

  return (
    <div
      className={`relative flex items-start gap-3 px-4 py-3.5 border-b border-border-subtle last:border-b-0 ${!n.read_status ? 'bg-surface-2/40' : ''} active:bg-surface-2 transition-colors`}
      onClick={() => onTap(n)}
    >
      {/* Unread dot */}
      {!n.read_status && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
      )}

      {/* Icon */}
      <div className={`shrink-0 w-9 h-9 rounded-xl border flex items-center justify-center text-base ${meta.color}`}>
        {meta.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-snug ${n.read_status ? 'text-text-secondary' : 'text-text-primary'}`}>
          {displayTitle}
        </p>
        {displayBody && (
          <p className="text-xs text-text-secondary mt-0.5 leading-relaxed line-clamp-2">
            {displayBody}
          </p>
        )}
        <p className="text-[10px] text-text-secondary/60 mt-1">{timeAgo}</p>
      </div>

      {/* Mark-read button */}
      {!n.read_status && (
        <button
          onClick={e => { e.stopPropagation(); onMarkRead(n.id) }}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-text-secondary hover:bg-surface-2 transition-colors"
          aria-label="Marcar como leída"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </button>
      )}
    </div>
  )
}

// ── Main NotificationCenter (exported) ────────────────────────────────────────

interface Props {
  /** Callback when unread count changes (for the bell badge) */
  onUnreadCountChange?: (count: number) => void
}

export default function NotificationCenter({ onUnreadCountChange }: Props) {
  const router = useRouter()
  const [open, setOpen]                   = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading]             = useState(false)

  const unreadCount = notifications.filter(n => !n.read_status).length

  // Notify parent of count changes
  useEffect(() => {
    onUnreadCountChange?.(unreadCount)
  }, [unreadCount, onUnreadCountChange])

  // Fetch on mount (and when panel opens)
  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  useEffect(() => {
    if (open) fetchNotifications()
  }, [open, fetchNotifications])

  async function markRead(id: string) {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read_status: true } : n)
    )
    await fetch(`/api/notifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read: true }),
    })
  }

  async function markAllRead() {
    const unread = notifications.filter(n => !n.read_status)
    setNotifications(prev => prev.map(n => ({ ...n, read_status: true })))
    await Promise.all(unread.map(n =>
      fetch(`/api/notifications/${n.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      })
    ))
  }

  async function handleTap(n: AppNotification) {
    // Mark as read
    if (!n.read_status) await markRead(n.id)
    // Navigate
    if (n.target_path) {
      setOpen(false)
      router.push(n.target_path)
    }
  }

  return (
    <>
      {/* Bell trigger */}
      <NotificationBell unreadCount={unreadCount} onClick={() => setOpen(true)} />

      {/* Bottom-sheet panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Sheet */}
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto rounded-t-3xl bg-surface border-t border-border-subtle shadow-2xl flex flex-col"
            style={{ maxHeight: '80dvh' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Notificaciones</h2>
                {unreadCount > 0 && (
                  <p className="text-xs text-text-secondary mt-0.5">{unreadCount} sin leer</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-xs font-medium text-primary hover:text-primary/80 transition-colors px-3 py-1.5 rounded-xl bg-primary/10"
                  >
                    Marcar todas
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Drag handle */}
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-border-subtle" />

            {/* List */}
            <div className="overflow-y-auto flex-1 pb-safe">
              {loading && notifications.length === 0 && (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!loading && notifications.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mb-3 text-xl">
                    🔔
                  </div>
                  <p className="text-sm font-medium text-text-primary">Sin notificaciones</p>
                  <p className="text-xs text-text-secondary mt-1">
                    Las alertas de parciales y fechas importantes aparecerán aquí
                  </p>
                </div>
              )}

              {notifications.length > 0 && (
                <div className="rounded-none">
                  {notifications.map(n => (
                    <NotifRow
                      key={n.id}
                      n={n}
                      onTap={handleTap}
                      onMarkRead={markRead}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
