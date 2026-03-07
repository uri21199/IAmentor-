'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import type { Semester } from '@/types'

export default function SettingsPage() {
  const supabase = createClient()
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [loading, setLoading] = useState(true)

  // New semester form
  const [showNewSemester, setShowNewSemester] = useState(false)
  const [newSemester, setNewSemester] = useState({
    name: '',
    start_date: '',
    end_date: '',
  })
  const [creating, setCreating] = useState(false)

  // Google Calendar
  const [calendarConnected, setCalendarConnected] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUser(user)

      const { data } = await supabase
        .from('semesters')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      setSemesters(data || [])

      // Check Google Calendar connection
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

  async function activateSemester(semesterId: string) {
    if (!user) return
    // Deactivate all
    await supabase
      .from('semesters')
      .update({ is_active: false })
      .eq('user_id', user.id)
    // Activate selected
    await supabase
      .from('semesters')
      .update({ is_active: true })
      .eq('id', semesterId)

    setSemesters(prev => prev.map(s => ({ ...s, is_active: s.id === semesterId })))
  }

  async function createSemester() {
    if (!user || !newSemester.name || !newSemester.start_date || !newSemester.end_date) return
    setCreating(true)
    try {
      const { data, error } = await supabase.from('semesters').insert({
        user_id: user.id,
        name: newSemester.name,
        start_date: newSemester.start_date,
        end_date: newSemester.end_date,
        is_active: false,
      }).select().single()

      if (!error && data) {
        setSemesters(prev => [data, ...prev])
        setShowNewSemester(false)
        setNewSemester({ name: '', start_date: '', end_date: '' })
      }
    } finally {
      setCreating(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function connectGoogleCalendar() {
    window.location.href = '/api/calendar/auth'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-5 max-w-lg mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary">Configuración ⚙️</h1>
        <p className="text-text-secondary text-sm mt-0.5">{user?.email}</p>
      </div>

      {/* Google Calendar */}
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
          onClick={connectGoogleCalendar}
        >
          {calendarConnected ? '🔄 Reconectar calendario' : '🔗 Conectar Google Calendar'}
        </Button>
      </Card>

      {/* Semesters */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary">Cuatrimestres</h2>
          <Button variant="secondary" size="sm" onClick={() => setShowNewSemester(!showNewSemester)}>
            + Nuevo
          </Button>
        </div>

        {/* New semester form */}
        {showNewSemester && (
          <Card variant="elevated" className="mb-3">
            <CardTitle className="mb-3">Nuevo cuatrimestre</CardTitle>
            <div className="space-y-3">
              <input
                type="text"
                value={newSemester.name}
                onChange={e => setNewSemester(p => ({ ...p, name: e.target.value }))}
                placeholder="Ej: 2do Cuatrimestre 2025"
                className="w-full h-11 px-4 rounded-2xl bg-background border border-border-subtle text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:border-primary/60"
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-xs text-text-secondary mb-1">Inicio</p>
                  <input
                    type="date"
                    value={newSemester.start_date}
                    onChange={e => setNewSemester(p => ({ ...p, start_date: e.target.value }))}
                    className="w-full h-11 px-4 rounded-2xl bg-background border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-text-secondary mb-1">Fin</p>
                  <input
                    type="date"
                    value={newSemester.end_date}
                    onChange={e => setNewSemester(p => ({ ...p, end_date: e.target.value }))}
                    className="w-full h-11 px-4 rounded-2xl bg-background border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-primary/60"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => setShowNewSemester(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  onClick={createSemester}
                  loading={creating}
                  disabled={!newSemester.name || !newSemester.start_date || !newSemester.end_date}
                >
                  Crear
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Semester list */}
        <div className="space-y-2">
          {semesters.map(sem => (
            <div
              key={sem.id}
              className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                sem.is_active
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-border-subtle bg-surface'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">{sem.name}</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  {sem.start_date} → {sem.end_date}
                </p>
              </div>
              {sem.is_active ? (
                <Badge variant="primary">Activo</Badge>
              ) : (
                <button
                  onClick={() => activateSemester(sem.id)}
                  className="text-xs text-text-secondary hover:text-primary transition-colors min-h-[36px] px-2"
                >
                  Activar
                </button>
              )}
            </div>
          ))}

          {semesters.length === 0 && (
            <p className="text-center text-sm text-text-secondary py-8">
              No hay cuatrimestres. Creá uno o ejecutá el SQL de seed.
            </p>
          )}
        </div>
      </div>

      {/* App info */}
      <Card variant="bordered">
        <div className="space-y-2 text-xs text-text-secondary">
          <div className="flex justify-between">
            <span>Versión</span>
            <span>0.1.0</span>
          </div>
          <div className="flex justify-between">
            <span>Motor IA</span>
            <span>Claude claude-sonnet-4-5</span>
          </div>
          <div className="flex justify-between">
            <span>Base de datos</span>
            <span>Supabase</span>
          </div>
        </div>
      </Card>

      {/* Sign out */}
      <Button variant="danger" size="lg" className="w-full" onClick={handleSignOut}>
        🚪 Cerrar sesión
      </Button>
    </div>
  )
}
