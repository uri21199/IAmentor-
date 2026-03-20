'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { createClient } from '@/lib/supabase'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { getWorkoutPlan, getNextWorkoutType } from '@/lib/exercises'
import { workoutTypeLabel, workoutTypeIcon, formatMinutes } from '@/lib/utils'
import type { WorkoutType, Exercise, StudyMode } from '@/types'

interface Props {
  energyLevel: number
  recentWorkouts: any[]
  todayWorkout: any | null
  last7Days: string[]
  workoutDays: Set<string>
  today: string
  userId: string
  studyMode?: StudyMode | null
}

const ENERGY_LABEL = ['', '🪫 Muy baja', '😮‍💨 Baja', '⚡ Normal', '🔥 Alta', '🚀 Máxima']
const ENERGY_SESSION = [
  '',
  'Movilidad suave (15-20 min)',
  'Movilidad/Stretching (20 min)',
  'Sesión de mantenimiento (30-40 min)',
  'Sesión completa (45 min)',
  'Sesión completa + extra (50-60 min)',
]

export default function GymClient({
  energyLevel,
  recentWorkouts,
  todayWorkout,
  last7Days,
  workoutDays,
  today,
  userId,
  studyMode,
}: Props) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [workoutDone, setWorkoutDone] = useState(!!todayWorkout?.completed)
  const [showExercises, setShowExercises] = useState(false)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [perceivedEffort, setPerceivedEffort] = useState<string>('')

  // Determine week number (number of weeks with at least one workout)
  const weekNumber = Math.max(1, Math.ceil(recentWorkouts.length / 5))

  // Determine next workout type
  const nextType: WorkoutType = energyLevel <= 2
    ? 'movilidad'
    : getNextWorkoutType(recentWorkouts)

  const lastPerceivedEffort = recentWorkouts[0]?.perceived_effort || null
  const plan = getWorkoutPlan(nextType, energyLevel, weekNumber, lastPerceivedEffort, studyMode)

  // Consistency stats
  const totalWorkouts = recentWorkouts.filter(w => w.completed).length
  const weeklyCount = last7Days.filter(d => workoutDays.has(d)).length
  const longestStreak = calculateStreak(recentWorkouts)

  function calculateStreak(workouts: any[]): number {
    let streak = 0
    const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date))
    let prev = today
    for (const w of sorted) {
      const diff = Math.abs(
        (new Date(prev).getTime() - new Date(w.date).getTime()) / (1000 * 60 * 60 * 24)
      )
      if (diff <= 1 && w.completed) {
        streak++
        prev = w.date
      } else break
    }
    return streak
  }

  async function logWorkout(felt: string) {
    setSaving(true)
    try {
      const { error } = await supabase.from('workouts').upsert({
        user_id: userId,
        date: today,
        type: nextType,
        duration_minutes: plan.duration_minutes,
        energy_used: energyLevel,
        completed: true,
        exercises_json: plan.exercises,
        perceived_effort: felt,
      })
      if (!error) {
        setWorkoutDone(true)
        setShowFeedbackModal(false)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 pt-4 pb-28 space-y-5 max-w-lg mx-auto md:max-w-2xl md:px-6">
      {/* Date + energy context strip */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-secondary capitalize">
          {format(parseISO(today), "EEEE d 'de' MMMM", { locale: es })}
        </p>
        <span className="text-xs text-text-secondary">{ENERGY_LABEL[energyLevel]}</span>
      </div>

      {/* Energy & session type */}
      <Card className="bg-green-500/10 border border-green-500/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-text-secondary mb-0.5">Sesión recomendada</p>
            <p className="text-sm font-semibold text-green-400">{ENERGY_SESSION[energyLevel]}</p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-green-500/20 flex items-center justify-center text-xl">
            💪
          </div>
        </div>
      </Card>

      {/* Feature 6: Cognitive load notice for exam / active-review weeks */}
      {(studyMode === 'exam_prep' || studyMode === 'active_review') && !workoutDone && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl border ${
          studyMode === 'exam_prep'
            ? 'bg-amber-500/10 border-amber-500/30'
            : 'bg-blue-500/10 border-blue-500/20'
        }`}>
          <span className="text-2xl shrink-0">{studyMode === 'exam_prep' ? '🧠' : '📖'}</span>
          <div>
            <p className={`text-sm font-semibold mb-0.5 ${
              studyMode === 'exam_prep' ? 'text-amber-400' : 'text-primary'
            }`}>
              {studyMode === 'exam_prep'
                ? 'Semana de parciales detectada'
                : 'Semana de repaso activo'}
            </p>
            <p className="text-xs text-text-secondary leading-relaxed">
              {studyMode === 'exam_prep'
                ? 'Hoy priorizamos recuperación para mantener tu rendimiento mental. Se recomienda movilidad en lugar de entrenamiento intenso.'
                : 'Tenés un parcial próximo. Una sesión moderada te permite estudiar sin fatiga extra.'}
            </p>
          </div>
        </div>
      )}

      {/* Today's workout card */}
      {workoutDone ? (
        <Card variant="elevated" className="text-center py-6">
          <p className="text-4xl mb-2">🏆</p>
          <p className="text-lg font-bold text-text-primary">¡Entrenamiento completado!</p>
          <p className="text-sm text-text-secondary mt-1">{workoutTypeLabel(nextType)}</p>
          <Badge variant="success" className="mt-3">{formatMinutes(plan.duration_minutes)}</Badge>
        </Card>
      ) : (
        <Card variant="elevated">
          <CardHeader>
            <div>
              <CardTitle>{workoutTypeIcon(nextType)} {workoutTypeLabel(nextType)}</CardTitle>
              <p className="text-xs text-text-secondary mt-0.5">Semana {weekNumber} · {formatMinutes(plan.duration_minutes)}</p>
            </div>
            <Badge variant="primary">Hoy</Badge>
          </CardHeader>

          <p className="text-sm text-text-secondary mb-4">{plan.description}</p>

          {/* Exercise list preview */}
          <div className="space-y-2 mb-4">
            {plan.exercises.slice(0, showExercises ? undefined : 3).map((ex, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2.5 rounded-xl bg-background border border-border-subtle cursor-pointer"
                onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
              >
                <span className="text-lg">{workoutTypeIcon(nextType)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{ex.name}</p>
                  <p className="text-xs text-text-secondary">
                    {ex.sets && `${ex.sets} series × `}
                    {ex.reps || (ex.duration_seconds ? `${ex.duration_seconds}s` : '')}
                    {ex.rest_seconds ? ` · ${ex.rest_seconds}s descanso` : ''}
                  </p>
                  {expandedIdx === i && ex.notes && (
                    <p className="text-xs text-amber-400 mt-1">💡 {ex.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {plan.exercises.length > 3 && (
            <button
              onClick={() => setShowExercises(!showExercises)}
              className="text-sm text-primary mb-4 w-full text-center"
            >
              {showExercises ? '▲ Mostrar menos' : `▼ Ver todos (${plan.exercises.length})`}
            </button>
          )}

          {/* Coach tip */}
          {plan.coachTip && (
            <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-400">💡 {plan.coachTip}</p>
            </div>
          )}

          <Button
            variant="success"
            size="lg"
            className="w-full"
            onClick={() => setShowFeedbackModal(true)}
          >
            ✅ Completé el entrenamiento
          </Button>
        </Card>
      )}

      {/* Weekly consistency */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Esta semana</h2>
        <div className="flex gap-2">
          {last7Days.map((day, i) => {
            const done = workoutDays.has(day)
            const dayLabel = format(parseISO(day), 'EEE', { locale: es }).slice(0, 2)
            const isToday = day === today
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className={`
                  w-full aspect-square rounded-xl flex items-center justify-center text-lg
                  ${done ? 'bg-green-500/20 border border-green-500/40' :
                    isToday ? 'bg-primary/10 border border-primary/30' :
                    'bg-surface-2 border border-border-subtle'}
                `}>
                  {done ? '💪' : isToday ? '⭐' : '·'}
                </div>
                <span className={`text-[10px] ${isToday ? 'text-primary font-medium' : 'text-text-secondary'}`}>
                  {dayLabel}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Week goal */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-2 border border-border-subtle">
        <div>
          <p className="text-sm font-medium text-text-primary">Meta semanal</p>
          <p className="text-xs text-text-secondary">{weeklyCount} de 3 sesiones</p>
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
              i < weeklyCount ? 'bg-green-500/20 text-green-400 border border-green-500/40' : 'bg-surface border border-border-subtle text-text-secondary'
            }`}>
              {i < weeklyCount ? '✓' : '·'}
            </div>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card variant="elevated" className="text-center p-3">
          <p className="text-2xl font-bold text-green-400">{weeklyCount}</p>
          <p className="text-xs text-text-secondary mt-0.5">Sesiones esta semana</p>
        </Card>
        <Card variant="elevated" className="text-center p-3">
          <p className="text-2xl font-bold text-primary">{longestStreak}</p>
          <p className="text-xs text-text-secondary mt-0.5">Racha actual</p>
        </Card>
        <Card variant="elevated" className="text-center p-3">
          <p className="text-2xl font-bold text-amber-400">{totalWorkouts}</p>
          <p className="text-xs text-text-secondary mt-0.5">Total completados</p>
        </Card>
      </div>

      {/* Recent history */}
      {recentWorkouts.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text-primary mb-3">Historial reciente</h2>
          <div className="space-y-2">
            {recentWorkouts.slice(0, 5).map((w: any) => (
              <div key={w.id} className="flex items-center gap-3 p-3 rounded-2xl bg-surface border border-border-subtle">
                <span className="text-xl">{workoutTypeIcon(w.type)}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-primary">{workoutTypeLabel(w.type)}</p>
                  <p className="text-xs text-text-secondary">
                    {format(parseISO(w.date), 'EEEE d/M', { locale: es })} · {formatMinutes(w.duration_minutes)}
                  </p>
                </div>
                {w.completed && <Badge variant="success">✓</Badge>}
                {w.perceived_effort && (
                  <span className="text-lg ml-1">
                    {w.perceived_effort === 'easy' ? '😌' : w.perceived_effort === 'good' ? '💪' : w.perceived_effort === 'hard' ? '😤' : '💀'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Post-workout feedback modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-24 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-text-primary">🏆 ¡Sesión completada!</h3>
              <button onClick={() => setShowFeedbackModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary">✕</button>
            </div>
            <p className="text-sm text-text-secondary mb-4">¿Cómo te sentiste durante el entrenamiento?</p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {[
                { value: 'easy', emoji: '😌', label: 'Muy fácil', desc: 'Podría haber dado más' },
                { value: 'good', emoji: '💪', label: 'Perfecto', desc: 'Nivel ideal' },
                { value: 'hard', emoji: '😤', label: 'Difícil', desc: 'Me costó bastante' },
                { value: 'exhausting', emoji: '💀', label: 'Agotador', desc: 'Necesito recuperar' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPerceivedEffort(opt.value)}
                  className={`p-4 rounded-2xl border text-left transition-all ${
                    perceivedEffort === opt.value
                      ? 'border-primary bg-primary/20'
                      : 'border-border-subtle bg-surface-2'
                  }`}
                >
                  <p className="text-2xl mb-1">{opt.emoji}</p>
                  <p className="text-sm font-medium text-text-primary">{opt.label}</p>
                  <p className="text-xs text-text-secondary">{opt.desc}</p>
                </button>
              ))}
            </div>
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => logWorkout(perceivedEffort || 'good')}
              loading={saving}
              disabled={!perceivedEffort}
            >
              Guardar entrenamiento
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
