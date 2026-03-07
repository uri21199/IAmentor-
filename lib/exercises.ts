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
  weekNumber: number
): { exercises: Exercise[]; duration_minutes: number; description: string } {
  const base = LOCAL_EXERCISES[type]

  // Progressive overload: increase sets/reps based on week
  const progressFactor = Math.min(1 + (weekNumber - 1) * 0.05, 1.5)

  let exercises: Exercise[]
  let duration: number
  let description: string

  if (energyLevel <= 2) {
    // Low energy: mobility only
    exercises = LOCAL_EXERCISES.movilidad
    duration = 15
    description = 'Sesión de movilidad suave. Escuchá tu cuerpo, sin forzar.'
  } else if (energyLevel === 3) {
    // Medium: maintenance session (less volume)
    exercises = base.slice(0, 4)
    duration = 35
    description = 'Sesión de mantenimiento. Técnica perfecta, volumen moderado.'
  } else {
    // High energy: full session
    exercises = base
    duration = type === 'movilidad' ? 20 : 50
    description = 'Sesión completa. Progresión semana ' + weekNumber + '.'
  }

  return { exercises, duration_minutes: duration, description }
}

export function getNextWorkoutType(
  lastWorkouts: Array<{ type: WorkoutType; date: string }>
): WorkoutType {
  const strengthTypes: WorkoutType[] = ['empuje', 'jale', 'piernas']
  const cardioTypes: WorkoutType[] = ['cardio', 'cardio']

  // Get the last few workouts to determine rotation
  const recentStrength = lastWorkouts
    .filter(w => strengthTypes.includes(w.type))
    .slice(0, 1)

  if (recentStrength.length === 0) return 'empuje'

  const last = recentStrength[0].type
  if (last === 'empuje') return 'jale'
  if (last === 'jale') return 'piernas'
  return 'empuje'
}
