'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { AppNotification, NotificationType } from '@/types'

const TYPE_META: Record<NotificationType, { icon: string; color: string; label: string }> = {
  exam_today:            { icon: '🚨', color: 'text-red-400 bg-red-500/10 border-red-500/30',     label: 'Examen hoy' },
  exam_approaching:      { icon: '🎯', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', label: 'Examen próximo' },
  deadline_approaching:  { icon: '📋', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30', label: 'Entrega próxima' },
  exam_alert:            { icon: '🎯', color: 'text-red-400 bg-red-500/10 border-red-500/30',     label: 'Alerta examen' },
  post_class:            { icon: '📚', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',  label: 'Post clase' },
  energy_boost:          { icon: '⚡', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', label: 'Boost energía' },
  early_win:             { icon: '✨', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',  label: 'Victoria rápida' },
}

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading]             = useState(true)
  const [filter, setFilter]               = useState<'all' | 'unread'>('all')

  const unreadCount = notifications.filter(n => !n.read_status).length

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

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  async function markRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_status: true } : n))
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
    if (!n.read_status) await markRead(n.id)
    if (n.target_path) router.push(n.target_path)
  }

  const visible = filter === 'unread'
    ? notifications.filter(n => !n.read_status)
    : notifications

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-24 md:max-w-2xl md:px-6">

      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div>
          {unreadCount > 0
            ? <p className="text-sm text-text-secondary">{unreadCount} sin leer</p>
            : <p className="text-sm text-text-secondary">Todo al día</p>
          }
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs font-medium text-primary hover:text-primary/80 px-3 py-1.5 rounded-xl bg-primary/10 transition-colors"
          >
            Marcar todas
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'unread'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-2xl text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-primary text-white'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary'
            }`}
          >
            {f === 'all' ? 'Todas' : `Sin leer${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && visible.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-3xl bg-surface-2 flex items-center justify-center mb-4 text-3xl">
            🔔
          </div>
          <p className="text-base font-semibold text-text-primary">
            {filter === 'unread' ? 'Todo leído' : 'Sin notificaciones'}
          </p>
          <p className="text-sm text-text-secondary mt-1.5 max-w-xs">
            {filter === 'unread'
              ? 'No tenés notificaciones pendientes'
              : 'Las alertas de parciales y fechas importantes aparecerán aquí'}
          </p>
        </div>
      )}

      {/* Notification list */}
      {!loading && visible.length > 0 && (
        <div className="rounded-2xl overflow-hidden border border-border-subtle bg-surface divide-y divide-border-subtle">
          {visible.map(n => {
            const meta     = TYPE_META[n.type] ?? TYPE_META.early_win
            const timeAgo  = formatDistanceToNow(parseISO(n.triggered_at), { addSuffix: true, locale: es })
            const title    = n.title ?? n.message
            const body     = n.body ?? null

            return (
              <div
                key={n.id}
                className={`relative flex items-start gap-3 px-4 py-4 transition-colors active:bg-surface-2 ${
                  !n.read_status ? 'bg-surface-2/40' : ''
                }`}
                onClick={() => handleTap(n)}
              >
                {/* Unread dot */}
                {!n.read_status && (
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                )}

                {/* Icon */}
                <div className={`shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center text-lg ${meta.color}`}>
                  {meta.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <p className={`flex-1 text-sm font-medium leading-snug ${n.read_status ? 'text-text-secondary' : 'text-text-primary'}`}>
                      {title}
                    </p>
                    {/* Mark read button */}
                    {!n.read_status && (
                      <button
                        onClick={e => { e.stopPropagation(); markRead(n.id) }}
                        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-text-secondary hover:bg-surface-2 transition-colors"
                        aria-label="Marcar como leída"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {body && (
                    <p className="text-xs text-text-secondary mt-0.5 leading-relaxed line-clamp-2">{body}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${meta.color}`}>
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-text-secondary/60">{timeAgo}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Push info note */}
      <p className="text-[11px] text-text-secondary/50 text-center mt-6 px-4">
        Las notificaciones también se envían al dispositivo si activaste los permisos en Configuración
      </p>
    </div>
  )
}
