import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { BlockType, TopicStatus, WorkoutType } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function blockTypeColor(type: BlockType): string {
  switch (type) {
    case 'work':   return 'bg-primary/20 border-primary/40 text-primary'
    case 'class':  return 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
    case 'study':  return 'bg-amber-500/20 border-amber-500/40 text-amber-400'
    case 'travel': return 'bg-orange-500/20 border-orange-500/40 text-orange-400'
    case 'gym':    return 'bg-green-500/20 border-green-500/40 text-green-400'
    case 'rest':   return 'bg-gray-500/20 border-gray-500/40 text-gray-400'
    case 'free':   return 'bg-purple-500/20 border-purple-500/40 text-purple-400'
    default:       return 'bg-gray-500/20 border-gray-500/40 text-gray-400'
  }
}

export function blockTypeIcon(type: BlockType): string {
  switch (type) {
    case 'work':   return '💼'
    case 'class':  return '🎓'
    case 'study':  return '📚'
    case 'travel': return '🚌'
    case 'gym':    return '💪'
    case 'rest':   return '☕'
    case 'free':   return '🎮'
    default:       return '📋'
  }
}

export function topicStatusColor(status: TopicStatus): string {
  switch (status) {
    case 'red':    return 'bg-red-500/20 border-red-500/40 text-red-400'
    case 'yellow': return 'bg-amber-500/20 border-amber-500/40 text-amber-400'
    case 'green':  return 'bg-green-500/20 border-green-500/40 text-green-400'
    default:       return 'bg-gray-500/20 border-gray-500/40 text-gray-400'
  }
}

export function topicStatusIcon(status: TopicStatus): string {
  switch (status) {
    case 'red':    return '🔴'
    case 'yellow': return '🟡'
    case 'green':  return '🟢'
    default:       return '⚪'
  }
}

export function workoutTypeLabel(type: WorkoutType): string {
  switch (type) {
    case 'empuje':   return 'Empuje (Pecho/Hombros/Tríceps)'
    case 'jale':     return 'Jale (Espalda/Bíceps)'
    case 'piernas':  return 'Piernas y Core'
    case 'cardio':   return 'Cardio'
    case 'movilidad': return 'Movilidad / Stretching'
    default: return type
  }
}

export function workoutTypeIcon(type: WorkoutType): string {
  switch (type) {
    case 'empuje':   return '🏋️'
    case 'jale':     return '💪'
    case 'piernas':  return '🦵'
    case 'cardio':   return '🏃'
    case 'movilidad': return '🧘'
    default: return '💪'
  }
}

export function stressLabel(level: string): string {
  switch (level) {
    case 'low':    return 'Tranquilo'
    case 'medium': return 'Algo estresado'
    case 'high':   return 'Muy estresado'
    default: return level
  }
}

export function workModeLabel(mode: string): string {
  switch (mode) {
    case 'presencial': return 'Presencial'
    case 'remoto':     return 'Remoto'
    case 'no_work':    return 'No trabajo'
    case 'libre':      return 'Día libre'
    default: return mode
  }
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 18) return 'Buenas tardes'
  return 'Buenas noches'
}
