/**
 * notifications-engine.ts
 *
 * Pure, testable trigger-evaluation logic.
 * No DB calls, no side effects — only pure functions.
 *
 * Triggers implemented:
 *   1. post_class   — 15 min after a class ends, if no class_log exists yet
 *   2. energy_boost — energy ≥4 but remaining plan is mostly light tasks
 *   3. exam_alert   — exam/event in ≤7 days with pending red topics
 *   4. early_win    — exam in 8–30 days, suggests a quick study session now
 */

import type {
  CheckIn,
  DailyPlan,
  ClassScheduleEntry,
  SubjectWithDetails,
  AcademicEvent,
} from '@/types'
import { calculateStudyPriorities } from './study-priority'

// ── Public types ───────────────────────────────────────────────────────────────

export type NotificationType = 'post_class' | 'energy_boost' | 'exam_alert' | 'early_win'

/** A notification ready to be persisted to the DB */
export interface PendingNotification {
  type: NotificationType
  message: string
  /** Deep-link URL the user is taken to when they act on the notification */
  target_path: string
  /** ISO timestamp after which the notification is no longer relevant */
  expires_at: string
  metadata: Record<string, unknown>
}

/** Full input required to evaluate all triggers */
export interface TriggerInput {
  // Daily context
  checkin: CheckIn | null
  plan: DailyPlan | null

  // Class schedule for TODAY's day-of-week (already filtered by day + is_active)
  classScheduleToday: ClassScheduleEntry[]

  // subject_ids that already have a class_log for today (don't re-notify)
  existingClassLogSubjectIds: string[]

  // Subjects with full unit/topic tree + events (for priority calc)
  subjectsWithDetails: SubjectWithDetails[]
  academicEvents: AcademicEvent[]

  // Already-created notifications for today (used for deduplication)
  existingTodayNotifications: Array<{
    type: string
    metadata: Record<string, unknown>
  }>

  /** Reference time — injectable for testing (defaults to now) */
  now: Date
}

// ── Internal helpers ────────────────────────────────────────────────────────────

/** Converts "HH:MM" to total minutes since midnight */
function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

/** Current time as minutes since midnight */
function nowMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes()
}

/** Returns true if this type was already notified today (single-fire types) */
function alreadySentToday(
  type: NotificationType,
  existing: TriggerInput['existingTodayNotifications']
): boolean {
  return existing.some(n => n.type === type)
}

// ── Trigger 1: Post-class ──────────────────────────────────────────────────────

/**
 * Fires 15–90 minutes after a class ends.
 *
 * Window rationale:
 *   - < 15 min: user might still be wrapping up
 *   - > 90 min: too late; the moment has passed
 *
 * Deep link: /subjects/[subject_id]?action=post_clase
 * → Subject detail page opens with the post-clase modal pre-focused
 */
export function buildPostClassTriggers(input: TriggerInput): PendingNotification[] {
  const results: PendingNotification[] = []
  const currentMin = nowMinutes(input.now)

  for (const cls of input.classScheduleToday) {
    if (!cls.is_active || !cls.subject_id) continue

    const endMin = timeToMinutes(cls.end_time)
    const minutesSinceEnd = currentMin - endMin

    // Only within the 15–90 min window
    if (minutesSinceEnd < 15 || minutesSinceEnd > 90) continue

    // Skip if the user already logged a post-clase entry for this subject today
    if (input.existingClassLogSubjectIds.includes(cls.subject_id)) continue

    // Skip if we already sent this exact notification today (per subject)
    const alreadySent = input.existingTodayNotifications.some(
      n => n.type === 'post_class' &&
           (n.metadata as Record<string, unknown>).subject_id === cls.subject_id
    )
    if (alreadySent) continue

    const subjectName = cls.subject?.name ?? 'tu materia'

    // Expires 2 hours after class ended (i.e. endMin + 2h)
    const expiresAt = new Date(input.now)
    expiresAt.setHours(0, 0, 0, 0)
    expiresAt.setMinutes(endMin + 120)

    results.push({
      type: 'post_class',
      message: `📚 Terminó ${subjectName}. ¿Cargás los temas que viste hoy?`,
      target_path: `/subjects/${cls.subject_id}?action=post_clase`,
      expires_at: expiresAt.toISOString(),
      metadata: {
        subject_id: cls.subject_id,
        subject_name: subjectName,
        class_end_time: cls.end_time,
        class_schedule_id: cls.id,
      },
    })
  }

  return results
}

// ── Trigger 2: Energy vs. plan load ────────────────────────────────────────────

/**
 * Fires when energy ≥ 4 but ≥ 50 % of the remaining plan blocks are "light"
 * (type = rest | free, or type = study with priority = low / undefined).
 *
 * Deep link: /today?action=replan
 * → TodayClient detects the param and auto-calls /api/ai/replan
 */
export function buildEnergyBoostTrigger(input: TriggerInput): PendingNotification | null {
  if (!input.checkin || input.checkin.energy_level < 4) return null
  if (!input.plan?.plan_json?.length) return null
  if (alreadySentToday('energy_boost', input.existingTodayNotifications)) return null

  const remaining = input.plan.plan_json.filter(b => !b.completed)
  if (remaining.length === 0) return null

  const lightBlocks = remaining.filter(
    b =>
      b.type === 'rest' ||
      b.type === 'free' ||
      (b.type === 'study' && (b.priority === 'low' || b.priority === undefined))
  )

  const lightRatio = lightBlocks.length / remaining.length
  if (lightRatio < 0.5) return null

  // Expires in 4 hours
  const expiresAt = new Date(input.now.getTime() + 4 * 60 * 60 * 1000)

  return {
    type: 'energy_boost',
    message: `⚡ Tenés energía ${input.checkin.energy_level}/5 y el plan tiene tareas livianas. ¿Querés replanificar con más carga?`,
    target_path: '/today?action=replan',
    expires_at: expiresAt.toISOString(),
    metadata: {
      energy_level: input.checkin.energy_level,
      light_ratio_pct: Math.round(lightRatio * 100),
    },
  }
}

// ── Trigger 3: Exam alert (≤ 7 days) ───────────────────────────────────────────

/**
 * Fires once per day when a subject has an event ≤ 7 days away AND
 * still has weak (red) topics pending.
 *
 * Uses calculateStudyPriorities() from study-priority.ts.
 * Deep link: /subjects/[subject_id]
 */
export function buildExamAlertTrigger(input: TriggerInput): PendingNotification | null {
  if (!input.subjectsWithDetails.length) return null
  if (alreadySentToday('exam_alert', input.existingTodayNotifications)) return null

  const priorities = calculateStudyPriorities({
    subjects: input.subjectsWithDetails,
    academic_events: input.academicEvents,
    reference_date: input.now,
  })

  // Closest subject with exam ≤7 days AND red weak topics
  const urgent = priorities.find(
    p =>
      p.days_to_event !== null &&
      p.days_to_event <= 7 &&
      p.weak_topics.some(t => t.status === 'red')
  )
  if (!urgent) return null

  const days = urgent.days_to_event!
  const daysText =
    days === 0 ? 'HOY' :
    days === 1 ? 'mañana' :
    `en ${days} días`

  const eventLabel =
    urgent.event_type === 'parcial' ? 'Parcial' :
    urgent.event_type === 'parcial_intermedio' ? 'Parcial Intermedio' :
    'Entrega TP'

  const redCount = urgent.weak_topics.filter(t => t.status === 'red').length
  const topTopic = urgent.weak_topics.find(t => t.status === 'red')
  const topicHint = topTopic ? ` Empezá por "${topTopic.name}".` : ''

  // Expires end of day
  const expiresAt = new Date(input.now)
  expiresAt.setHours(23, 59, 59, 0)

  return {
    type: 'exam_alert',
    message: `🎯 ${eventLabel} de ${urgent.subject_name} ${daysText}. Tenés ${redCount} tema${redCount > 1 ? 's' : ''} en rojo.${topicHint}`,
    target_path: `/subjects/${urgent.subject_id}`,
    expires_at: expiresAt.toISOString(),
    metadata: {
      subject_id: urgent.subject_id,
      subject_name: urgent.subject_name,
      days_to_event: days,
      event_type: urgent.event_type,
      red_topics_count: redCount,
    },
  }
}

// ── Trigger 4: Early win (8–30 days) ───────────────────────────────────────────

/**
 * Fires once per day when a subject has an event 8–30 days away.
 * Suggests a quick "early win" study session to get ahead.
 *
 * Only fires if no exam_alert was triggered (avoids duplication).
 * Deep link: /subjects/[subject_id]
 */
export function buildEarlyWinTrigger(input: TriggerInput): PendingNotification | null {
  if (!input.subjectsWithDetails.length) return null
  if (alreadySentToday('early_win', input.existingTodayNotifications)) return null

  const priorities = calculateStudyPriorities({
    subjects: input.subjectsWithDetails,
    academic_events: input.academicEvents,
    reference_date: input.now,
  })

  // Subject with upcoming event in 8–30 days + weak topics
  const candidate = priorities.find(
    p =>
      p.days_to_event !== null &&
      p.days_to_event >= 8 &&
      p.days_to_event <= 30 &&
      p.weak_topics.length > 0
  )
  if (!candidate) return null

  const topTopic = candidate.recommended_topics[0]
  if (!topTopic) return null

  // Expires end of day
  const expiresAt = new Date(input.now)
  expiresAt.setHours(23, 59, 59, 0)

  const eventLabel =
    candidate.event_type === 'parcial' ? 'el parcial' :
    candidate.event_type === 'parcial_intermedio' ? 'el parcial intermedio' :
    'la entrega'

  return {
    type: 'early_win',
    message: `✨ Victoria temprana: 30 min de "${topTopic.name}" en ${candidate.subject_name} hoy puede marcar la diferencia. ${eventLabel} es en ${candidate.days_to_event} días.`,
    target_path: `/subjects/${candidate.subject_id}`,
    expires_at: expiresAt.toISOString(),
    metadata: {
      subject_id: candidate.subject_id,
      subject_name: candidate.subject_name,
      topic_id: topTopic.id,
      topic_name: topTopic.name,
      days_to_event: candidate.days_to_event,
      event_type: candidate.event_type,
    },
  }
}

// ── Main evaluator ──────────────────────────────────────────────────────────────

/**
 * Evaluates all triggers and returns a list of notifications to persist.
 * The caller (API route) is responsible for inserting them into the DB.
 *
 * Order matters for UX: post_class → exam_alert → energy_boost → early_win
 * (most urgent / time-sensitive first)
 */
export function evaluateTriggers(input: TriggerInput): PendingNotification[] {
  const results: PendingNotification[] = []

  // 1. Post-class: multiple can fire simultaneously (one per class)
  results.push(...buildPostClassTriggers(input))

  // 2. Exam alert: highest academic urgency
  const examAlert = buildExamAlertTrigger(input)
  if (examAlert) results.push(examAlert)

  // 3. Energy boost: only meaningful if check-in done + plan exists
  const energyBoost = buildEnergyBoostTrigger(input)
  if (energyBoost) results.push(energyBoost)

  // 4. Early win: only if no exam_alert (avoids showing two academic alerts)
  if (!examAlert) {
    const earlyWin = buildEarlyWinTrigger(input)
    if (earlyWin) results.push(earlyWin)
  }

  return results
}
