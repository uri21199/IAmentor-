'use client'

import { useRouter } from 'next/navigation'
import type { AppNotification, NotificationType } from '@/types'

// ── Icon + accent color per notification type ──────────────────────────────────

const TYPE_META: Record<NotificationType, { icon: string; accent: string; label: string }> = {
  post_class:    { icon: '📚', accent: 'border-cyan-500/40 bg-cyan-500/5',   label: 'Post-clase' },
  energy_boost:  { icon: '⚡', accent: 'border-amber-500/40 bg-amber-500/5', label: 'Energía alta' },
  exam_alert:    { icon: '🎯', accent: 'border-red-500/40 bg-red-500/5',     label: 'Examen próximo' },
  early_win:     { icon: '✨', accent: 'border-primary/40 bg-primary/5',     label: 'Victoria temprana' },
}

// ── Single notification card ───────────────────────────────────────────────────

interface NotificationCardProps {
  notification: AppNotification
  onAction: (id: string, targetPath: string | null) => void
  onDismiss: (id: string) => void
}

function NotificationCard({ notification, onAction, onDismiss }: NotificationCardProps) {
  const meta = TYPE_META[notification.type] ?? TYPE_META.early_win

  const actionLabel =
    notification.type === 'post_class'   ? 'Cargar temas' :
    notification.type === 'energy_boost' ? 'Replanificar' :
    notification.type === 'exam_alert'   ? 'Ver materia' :
    'Ver materia'

  return (
    <div
      className={`relative flex items-start gap-3 p-3 rounded-2xl border ${meta.accent} transition-all`}
      role="alert"
      aria-label={meta.label}
    >
      {/* Icon */}
      <span className="text-xl shrink-0 mt-0.5" aria-hidden="true">{meta.icon}</span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-0.5">
          {meta.label}
        </p>
        <p className="text-sm text-text-primary leading-snug">
          {notification.message}
        </p>

        {/* Action button */}
        {notification.target_path && (
          <button
            onClick={() => onAction(notification.id, notification.target_path)}
            className="mt-2 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            {actionLabel} →
          </button>
        )}
      </div>

      {/* Dismiss ✕ */}
      <button
        onClick={() => onDismiss(notification.id)}
        className="shrink-0 text-text-secondary hover:text-text-primary transition-colors p-1 -mt-0.5 -mr-0.5"
        aria-label="Descartar notificación"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

// ── Banner list (exported) ─────────────────────────────────────────────────────

interface Props {
  notifications: AppNotification[]
  /** Called when user clicks the action button — also triggers read mark + navigation */
  onAction: (id: string, targetPath: string | null) => void
  /** Called when user clicks ✕ — marks as read, no navigation */
  onDismiss: (id: string) => void
}

export default function NotificationBanner({ notifications, onAction, onDismiss }: Props) {
  if (!notifications.length) return null

  return (
    <div className="space-y-2" aria-live="polite" aria-label="Notificaciones">
      {notifications.map(n => (
        <NotificationCard
          key={n.id}
          notification={n}
          onAction={onAction}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  )
}
