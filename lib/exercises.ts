/**
 * Bodyweight / outdoor exercise database.
 * Uses the Wger REST API (free, no auth required for basic exercises).
 * Falls back to local library if API is unavailable.
 */

import type { Exercise, WorkoutType } from '@/types'

// ── Local exercise library (calisthenics / bodyweight) ────────────────────────

const LOCAL_EXERCISES: Record<WorkoutType, Exercise[]> = {
  empuje: [
    { name: 'Flexiones', sets: 3, reps: '10-15', rest_seconds: 60, notes: 'Espalda recta, pecho al suelo' },
    { name: 'Fondos entre sillas', sets: 3, reps: '8-12', rest_seconds: 60, notes: 'Control total en el descenso' },
    { name: 'Flexiones diamante', sets: 3, reps: '8-12', rest_seconds: 60, notes: 'Manos juntas, énfasis en tríceps' },
    { name: 'Flexiones Pike', sets: 3, reps: '10-12', rest_seconds: 60, notes: 'Cadera arriba, carga en hombros' },
    { name: 'Flexiones declinadas', sets: 3, reps: '8-12', rest_seconds: 60, notes: 'Pies elevados, alto pecho' },
    { name: 'Extensiones de tríceps (piso)', sets: 3, reps: '10-15', rest_seconds: 60 },
  ],
  jale: [
    { name: 'Dominadas (o asistidas)', sets: 3, reps: '6-10', rest_seconds: 90, notes: 'Rango completo de movimiento' },
    { name: 'Remo con mochila', sets: 3, reps: '10-15', rest_seconds: 60, notes: 'Usar mochila con libros de peso' },
    { name: 'Curl de bíceps con botella', sets: 3, reps: '12-15', rest_seconds: 45 },
    { name: 'Remo invertido (bajo la mesa)', sets: 3, reps: '10-15', rest_seconds: 60 },
    { name: 'Face pull con banda elástica', sets: 3, reps: '15-20', rest_seconds: 45 },
    { name: 'Superman (extensión espalda baja)', sets: 3, reps: '12-15', rest_seconds: 45 },
  ],
  piernas: [
    { name: 'Sentadillas', sets: 4, reps: '15-20', rest_seconds: 60, notes: 'Rodillas alineadas con pies' },
    { name: 'Zancadas alternadas', sets: 3, reps: '12 c/lado', rest_seconds: 60 },
    { name: 'Sentadilla búlgara', sets: 3, reps: '10 c/lado', rest_seconds: 60, notes: 'Pie trasero elevado' },
    { name: 'Puente de glúteos', sets: 3, reps: '15-20', rest_seconds: 45 },
    { name: 'Plancha', sets: 3, duration_seconds: 40, rest_seconds: 30 },
    { name: 'Elevación de cadera unilateral', sets: 3, reps: '12 c/lado', rest_seconds: 45 },
    { name: 'Mountain climbers', sets: 3, duration_seconds: 30, rest_seconds: 30 },
  ],
  cardio: [
    { name: 'Saltar a la cuerda', sets: 5, duration_seconds: 60, rest_seconds: 30 },
    { name: 'Burpees', sets: 4, reps: '10-12', rest_seconds: 60 },
    { name: 'Jumping jacks', sets: 4, duration_seconds: 45, rest_seconds: 30 },
    { name: 'Sprints en el lugar', sets: 6, duration_seconds: 30, rest_seconds: 30 },
    { name: 'Trote / caminata rápida', sets: 1, duration_seconds: 1800, notes: '30 minutos a ritmo moderado' },
    { name: 'Step ups en escalón', sets: 4, reps: '15 c/lado', rest_seconds: 30 },
  ],
  movilidad: [
    { name: 'Apertura de cadera en el suelo', sets: 1, duration_seconds: 60, notes: 'Suave, sin forzar' },
    { name: 'Estiramiento de isquiotibiales', sets: 1, duration_seconds: 45, notes: 'Cada pierna' },
    { name: 'Rotación de columna torácica', sets: 1, reps: '10 c/lado' },
    { name: 'Estiramiento de cuádriceps', sets: 1, duration_seconds: 45, notes: 'Cada pierna' },
    { name: 'Postura del niño (yoga)', sets: 1, duration_seconds: 60 },
    { name: 'Círculos de hombros', sets: 1, reps: '15 c/lado', notes: 'Lentos y controlados' },
    { name: 'Estiramiento de pecho en pared', sets: 1, duration_seconds: 45, notes: 'Cada brazo' },
    { name: 'Elongación de cadena posterior', sets: 1, duration_seconds: 60 },
  ],
}

// ── Wger API integration ───────────────────────────────────────────────────────

const WGER_BASE = 'https://wger.de/api/v2'

interface WgerExercise {
  id: number
  name: string
  description: string
  category: { name: string }
  muscles: Array<{ name_en: string }>
}

export async function fetchExercisesFromAPI(
  category: string
): Promise<Exercise[]> {
  try {
    const res = await fetch(
      `${WGER_BASE}/exercise/?format=json&language=2&category=${category}&limit=10`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) throw new Error('Wger API error')
    const data = await res.json()
    return (data.results as WgerExercise[]).map(e => ({
      name: e.name,
      sets: 3,
      reps: '10-12',
      rest_seconds: 60,
      notes: e.muscles.map(m => m.name_en).join(', '),
    }))
  } catch {
    return []
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

export function getWorkoutPlan(
  type: WorkoutType,
  energyLevel: number,
  weekNumber: number,
  lastPerceivedEffort?: string | null
): { exercises: Exercise[]; duration_minutes: number; description: string; coachTip: string } {
  const base = LOCAL_EXERCISES[type]

  // Progressive overload: increase sets/reps based on week
  const progressFactor = Math.min(1 + (weekNumber - 1) * 0.05, 1.5)

  let exercises: Exercise[]
  let duration: number
  let description: string
  let coachTip: string

  if (energyLevel <= 2) {
    // Low energy: mobility only
    exercises = LOCAL_EXERCISES.movilidad
    duration = 15
    description = 'Sesión de movilidad suave. Escuchá tu cuerpo, sin forzar.'
    coachTip = 'Con poca energía, el movimiento suave acelera la recuperación más que el descanso total.'
  } else if (energyLevel === 3) {
    // Medium: maintenance session (less volume)
    exercises = base.slice(0, 4)
    duration = 35
    description = 'Sesión de mantenimiento. Técnica perfecta, volumen moderado.'
    coachTip = 'Hoy priorizá la técnica sobre el volumen — construye la base para las sesiones intensas.'
  } else {
    // High energy: full session
    exercises = base
    duration = type === 'movilidad' ? 20 : 50
    description = 'Sesión completa. Progresión semana ' + weekNumber + '.'
    coachTip = 'Excelente energía — aprovechá para superar tu marca de la semana pasada.'
  }

  // Adjust based on last perceived effort
  if (lastPerceivedEffort === 'easy') {
    // Add 1 extra set to each exercise and 5 min to duration
    exercises = exercises.map(ex => ({
      ...ex,
      sets: ex.sets ? ex.sets + 1 : ex.sets,
      notes: ex.notes ? ex.notes + ' (+1 serie extra)' : '+1 serie extra',
    }))
    duration = duration + 5
    coachTip = 'La sesión anterior te resultó fácil — sumamos una serie extra por ejercicio para mantener el progreso.'
  } else if (lastPerceivedEffort === 'exhausting') {
    // Force mobility session for recovery
    exercises = LOCAL_EXERCISES.movilidad
    duration = 15
    description = 'Sesión de recuperación activa. Tu cuerpo lo necesita hoy.'
    coachTip = 'Después de un entrenamiento agotador, la movilidad activa acelera tu recuperación.'
  } else if (lastPerceivedEffort === 'hard') {
    // Reduce to 3 exercises and shorten duration
    exercises = exercises.slice(0, 3)
    duration = Math.max(15, duration - 5)
    coachTip = 'Volumen reducido para que puedas recuperarte bien tras la sesión exigente anterior.'
  }
  // 'good' or null: maintain current plan (coachTip already set above)

  return { exercises, duration_minutes: duration, description, coachTip }
}

export function getNextWorkoutType(
  lastWorkouts: Array<{ type: WorkoutType; date: string }>
): WorkoutType {
  const rotation: WorkoutType[] = ['empuje', 'jale', 'piernas', 'cardio']

  // Find the last strength or cardio workout (ignore movilidad)
  const relevantWorkouts = lastWorkouts.filter(w =>
    w.type === 'empuje' || w.type === 'jale' || w.type === 'piernas' || w.type === 'cardio'
  )

  if (relevantWorkouts.length === 0) return 'empuje'

  const lastType = relevantWorkouts[0].type
  const currentIndex = rotation.indexOf(lastType)

  if (currentIndex === -1) return 'empuje'

  // Return the next type in the rotation, wrapping around
  return rotation[(currentIndex + 1) % rotation.length]
}
