'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import type { WeeklyPlanResponse, WeeklyDayPlan } from '@/app/api/ai/weekly-plan/route'

const TYPE_LABELS: Record<string, string> = {
  parcial: 'Parcial',
  parcial_intermedio: 'Parcialito',
  entrega_tp: 'Entrega TP',
  medico: 'Médico',
  personal: 'Personal',
}

const TYPE_COLORS: Record<string, string> = {
  parcial: 'bg-red-500/20 text-red-400 border-red-500/30',
  parcial_intermedio: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  entrega_tp: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}

function DayCard({ day }: { day: WeeklyDayPlan }) {
  const [expanded, setExpanded] = useState(false)
  const hasStudy = day.study_goals.length > 0
  const hasExam = day.academic_events.some(e => ['parcial', 'parcial_intermedio', 'entrega_tp'].includes(e.type))

  return (
    <div
      className={`rounded-2xl border transition-all overflow-hidden ${
        hasExam
          ? 'bg-red-500/5 border-red-500/20'
          : hasStudy
          ? 'bg-surface border-border-subtle'
          : 'bg-surface-2 border-border-subtle opacity-60'
      }`}
    >
      {/* Day header */}
      <button
        onClick={() => hasStudy && setExpanded(v => !v)}
        className={`w-full flex items-center justify-between px-4 py-3 ${hasStudy ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-3">
          <div className="text-center w-10">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-text-secondary">{day.day_label}</p>
            <p className="text-base font-bold text-text-primary leading-none mt-0.5">{day.date.slice(8)}</p>
          </div>
          <div className="flex flex-col gap-1">
            {day.academic_events.map((e, i) => (
              <span
                key={i}
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${TYPE_COLORS[e.type] || 'bg-surface-2 text-text-secondary border-border-subtle'}`}
              >
                {TYPE_LABELS[e.type] || e.type}: {e.title}
              </span>
            ))}
            {day.has_work && !hasExam && (
              <span className="text-[10px] text-text-secondary">💼 Laboral</span>
            )}
            {day.has_class && !hasExam && (
              <span className="text-[10px] text-text-secondary">🎓 Clases</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasStudy ? (
            <div className="text-right">
              <p className="text-sm font-semibold text-text-primary">{day.total_study_minutes}min</p>
              <p className="text-[10px] text-text-secondary">{day.study_goals.length} materia{day.study_goals.length !== 1 ? 's' : ''}</p>
            </div>
          ) : (
            <p className="text-xs text-text-secondary italic">Sin estudio</p>
          )}
          {hasStudy && (
            <svg
              className={`w-4 h-4 text-text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </button>

      {/* Expanded study goals */}
      {expanded && hasStudy && (
        <div className="border-t border-border-subtle px-4 pb-4 pt-3 space-y-3">
          {day.study_goals.map((goal, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-text-primary">{goal.subject_name}</p>
                  <span className="text-xs text-text-secondary shrink-0">{goal.minutes}min</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {goal.topics.map((t, j) => (
                    <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {day.tip && (
            <p className="text-xs text-text-secondary italic mt-1 px-1">{day.tip}</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function WeeklyClient() {
  const [plan, setPlan] = useState<WeeklyPlanResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generatePlan() {
    setLoading(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/ai/weekly-plan', { method: 'POST' })
      if (res.status === 429) {
        setError('Límite de generaciones alcanzado. Intentá de nuevo mañana.')
        return
      }
      if (!res.ok) {
        const body = await res.json()
        setError(body.error || 'Error al generar el plan')
        return
      }
      const data = await res.json()
      setPlan(data)
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  async function saveToWeek() {
    if (!plan) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/weekly-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: plan.days }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error || 'No se pudo guardar el plan')
        return
      }
      setSaved(true)
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function removeFromWeek() {
    if (!plan) return
    setSaving(true)
    setError(null)
    try {
      const dates = plan.days.map(d => d.date).join(',')
      const res = await fetch(`/api/weekly-goals?dates=${dates}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error || 'No se pudo quitar el plan')
        return
      }
      setSaved(false)
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary">Planificador semanal</h1>
        <p className="text-sm text-text-secondary mt-0.5">Plan de estudio para los próximos 7 días</p>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-500/10 border border-red-500/30 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {!plan && !loading && (
        <div className="rounded-3xl bg-surface-2 border border-border-subtle p-10 text-center">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-base font-semibold text-text-primary mb-1">Sin plan esta semana</p>
          <p className="text-sm text-text-secondary mb-5 max-w-xs mx-auto">
            La IA analiza tus materias, eventos y horario de trabajo para armar el mejor plan de estudio.
          </p>
          <Button variant="primary" onClick={generatePlan} loading={loading}>
            Generar mi plan semanal
          </Button>
        </div>
      )}

      {loading && !plan && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-surface-2 border border-border-subtle animate-pulse" />
          ))}
        </div>
      )}

      {plan && (
        <>
          {/* Save to week banner/button */}
          {saved ? (
            <div className="rounded-2xl bg-green-500/10 border border-green-500/20 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm text-green-400 font-medium">Plan guardado — el plan diario de cada día lo tendrá en cuenta</p>
              </div>
              <button
                onClick={removeFromWeek}
                disabled={saving}
                className="text-xs text-text-secondary hover:text-red-400 transition-colors shrink-0"
              >
                Quitar
              </button>
            </div>
          ) : (
            <button
              onClick={saveToWeek}
              disabled={saving}
              className="w-full rounded-2xl bg-primary/10 border border-primary/30 hover:bg-primary/20 transition-colors px-4 py-3 flex items-center justify-center gap-2"
            >
              {saving ? (
                <span className="text-sm text-primary">Guardando...</span>
              ) : (
                <>
                  <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  <span className="text-sm font-medium text-primary">Agregar a la semana</span>
                </>
              )}
            </button>
          )}

          {/* Weekly focus banner */}
          <div className="rounded-2xl bg-surface-2 border border-border-subtle px-4 py-3 flex items-start gap-3">
            <span className="text-xl shrink-0">🎯</span>
            <div>
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-0.5">Foco de la semana</p>
              <p className="text-sm text-text-primary">{plan.weekly_focus}</p>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-surface-2 border border-border-subtle p-3 text-center">
              <p className="text-xl font-bold text-text-primary">{plan.total_hours}h</p>
              <p className="text-[10px] text-text-secondary mt-0.5">estudio total</p>
            </div>
            <div className="rounded-2xl bg-surface-2 border border-border-subtle p-3 text-center">
              <p className="text-xl font-bold text-cyan-400">{plan.days.filter(d => d.study_goals.length > 0).length}</p>
              <p className="text-[10px] text-text-secondary mt-0.5">días activos</p>
            </div>
            <div className="rounded-2xl bg-surface-2 border border-border-subtle p-3 text-center">
              <p className="text-xl font-bold text-violet-400">
                {plan.days.reduce((s, d) => s + new Set(d.study_goals.map(g => g.subject_name)).size, 0)}
              </p>
              <p className="text-[10px] text-text-secondary mt-0.5">sesiones</p>
            </div>
          </div>

          {/* Day cards */}
          <div className="space-y-2">
            {plan.days.map(day => (
              <DayCard key={day.date} day={day} />
            ))}
          </div>

          <div className="flex items-center justify-between pt-1 pb-2">
            <p className="text-[10px] text-text-secondary">
              Plan generado por IA • Tocá cada día para ver los detalles
            </p>
            <button
              onClick={generatePlan}
              disabled={loading}
              className="text-xs text-text-secondary hover:text-primary transition-colors disabled:opacity-40"
            >
              {loading ? 'Generando...' : 'Regenerar'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
