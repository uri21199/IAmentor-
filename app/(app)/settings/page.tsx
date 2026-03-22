'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { usePushNotifications } from '@/hooks/usePushNotifications'

export default function SettingsPage() {
  const supabase = createClient()

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [calendarConnected, setCalendarConnected] = useState(false)

  const {
    supported: pushSupported,
    permission: pushPermission,
    subscribed: pushSubscribed,
    loading: pushLoading,
    subscribe: subscribePush,
    unsubscribe: unsubscribePush,
  } = usePushNotifications()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUser(user)

      const { data: integration } = await supabase
        .from('user_integrations')
        .select('id')
        .eq('user_id', user.id)
        .eq('provider', 'google_calendar')
        .single()
      setCalendarConnected(!!integration)

      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="px-4 pt-5 pb-28 space-y-5 max-w-lg mx-auto md:max-w-2xl md:px-6">

      {/* Header */}
      <div>
        <p className="text-xs text-text-secondary">{user?.email}</p>
      </div>

      {/* ── Google Calendar ──────────────────────────────────── */}
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>📅 Google Calendar</CardTitle>
          <Badge variant={calendarConnected ? 'success' : 'default'}>
            {calendarConnected ? 'Conectado' : 'Desconectado'}
          </Badge>
        </CardHeader>
        <p className="text-xs text-text-secondary mb-4">
          Conectá tu calendario para que la IA incluya tus eventos en el plan diario
        </p>
        <Button
          variant={calendarConnected ? 'secondary' : 'primary'}
          size="md"
          className="w-full"
          onClick={() => { window.location.href = '/api/calendar/auth' }}
        >
          {calendarConnected ? '🔄 Reconectar calendario' : '🔗 Conectar Google Calendar'}
        </Button>
      </Card>

      {/* ── Push Notifications ───────────────────────────────── */}
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>🔔 Notificaciones</CardTitle>
          <Badge variant={pushSubscribed ? 'success' : 'default'}>
            {!pushSupported ? 'No soportado' : pushSubscribed ? 'Activadas' : 'Desactivadas'}
          </Badge>
        </CardHeader>
        <p className="text-xs text-text-secondary mb-4">
          {!pushSupported
            ? 'Tu navegador no soporta notificaciones push.'
            : pushPermission === 'denied'
              ? 'Notificaciones bloqueadas. Activálas desde la configuración del navegador.'
              : 'Recibí recordatorios: check-in matutino, registro post-clase, y más.'}
        </p>
        {pushSupported && pushPermission !== 'denied' && (
          <Button
            variant={pushSubscribed ? 'secondary' : 'primary'}
            size="md"
            className="w-full"
            onClick={pushSubscribed ? unsubscribePush : subscribePush}
            loading={pushLoading}
          >
            {pushSubscribed ? '🔕 Desactivar notificaciones' : '🔔 Activar notificaciones'}
          </Button>
        )}
      </Card>

      {/* ── Configuración académica ────────────────────────── */}
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Configuración académica</CardTitle>
        </CardHeader>
        <div className="space-y-1">
          {[
            { href: '/cuatrimestres', icon: '🎓', label: 'Cuatrimestres', desc: 'Gestioná tus cuatrimestres y materias' },
            { href: '/cursada',       icon: '📅', label: 'Cursada',        desc: 'Horario semanal de clases' },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-surface-2 transition-colors group"
            >
              <span className="text-xl shrink-0">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">{item.label}</p>
                <p className="text-xs text-text-secondary">{item.desc}</p>
              </div>
              <svg className="w-4 h-4 text-text-secondary/40 group-hover:text-text-secondary transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      </Card>

      {/* ── Configuración laboral ─────────────────────────── */}
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Trabajo</CardTitle>
        </CardHeader>
        <Link
          href="/trabajo"
          className="flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-surface-2 transition-colors group"
        >
          <span className="text-xl shrink-0">💼</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary">Horario laboral</p>
            <p className="text-xs text-text-secondary">Días, horario y modalidad de trabajo</p>
          </div>
          <svg className="w-4 h-4 text-text-secondary/40 group-hover:text-text-secondary transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </Card>

      {/* App info */}
      <Card variant="bordered">
        <div className="space-y-2 text-xs text-text-secondary">
          <div className="flex justify-between"><span>Versión</span><span>0.2.0</span></div>
          <div className="flex justify-between"><span>Motor IA</span><span>Claude Sonnet 4.5</span></div>
          <div className="flex justify-between"><span>Base de datos</span><span>Supabase</span></div>
        </div>
      </Card>

    </div>
  )
}
