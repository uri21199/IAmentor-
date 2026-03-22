import type { AcademicEventType } from '@/types'

/**
 * Human-readable labels for all academic event types.
 * Single source of truth — import from here instead of redefining locally.
 */
export const EVENT_TYPE_LABELS: Record<AcademicEventType, string> = {
  parcial:            'Parcial',
  parcial_intermedio: 'Parcial Int.',
  entrega_tp:         'Entrega TP',
  medico:             'Turno médico',
  personal:           'Evento personal',
  recuperatorio:      'Recuperatorio',
}

/**
 * Event types that can receive a numeric grade.
 * Excludes medico and personal which have no academic score.
 */
export const GRADEABLE_EVENT_TYPES: AcademicEventType[] = [
  'parcial',
  'parcial_intermedio',
  'entrega_tp',
  'recuperatorio',
]
