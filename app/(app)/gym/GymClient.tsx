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
import type { WorkoutType, Exercise } from '@/types'

interface Props {
  energyLevel: number
  recentWorkouts: any[]
  todayWorkout: any | null
  last7Days: string[]
  workoutDays: Set<string>
  today: string
  userId: string
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
}: Props) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [workoutDone, setWorkoutDone] = useState(!!todayWorkout?.completed)
  const [showExercises, setShowExercises] = useState(false)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  // Determine week number (number of weeks with at least one workout)
  const weekNumber = Math.max(1, Math.ceil(recentWorkouts.length / 5))

  // Determine next workout type
  const nextType: WorkoutType = energyLevel <= 2
    ? 'movilidad'
    : getNextWorkoutType(recentWorkouts)

  const plan = getWorkoutPlan(nextType, energyLevel, weekNumber)

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

  async function logWorkout() {
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
      })
      if (!error) {
        setWorkoutDone(true)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-5 max-w-lg mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary">Entrenamiento 💪</h1>
        <p className="text-text-secondary text-sm mt-0.5">
          {format(parseISO(today), "EEEE d 'de' MMMM", { locale: es })}
        </p>
      </div>

      {/* Energy & session type */}
      <Card className="gradient-energy border border-green-500/20">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs text-text-secondary">Energía hoy</p>
            <p className="text-lg font-bold text-text-primary">{ENERGY_LABEL[energyLevel]}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-text-secondary">Tipo de sesión</p>
            <p className="text-sm font-semibold text-green-400">{ENERGY_SESSION[energyLevel]}</p>
          </div>
        </div>
      </Card>

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

          <Button
            variant="success"
            size="lg"
            className="w-full"
            onClick={logWorkout}
            loading={saving}
          >
            ✅ Marcar como completado
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
