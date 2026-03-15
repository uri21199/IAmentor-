/**
 * notifications-engine.ts
 *
 * Pure, testable trigger-evaluation logic.
 * No DB calls, no side effects — only pure functions.
 *
 * Triggers implemented:
 *   1. post_class        — 15 min after a class ends, if no class_log exists yet
 *   2. energy_boost      — energy ≥4 but remaining plan is mostly light tasks
 *   3. exam_alert        — exam/event in ≤7 days with pending red topics (legacy)
 *   4. early_win         — exam in 8–30 days, suggests a quick study session now
 *   5. exam_approaching  — smart deadline alert at 14/10/7/5/1 days before a parcial
 *   6. deadline_approaching — same for entrega_tp
 *   7. exam_today        — day-of alert (0 days)
 */

import type {
  CheckIn,
  DailyPlan,
  ClassScheduleEntry,
  SubjectWithDetails,
  AcademicEvent,
  DeadlineAlertContext,
} from '@/types'
import { calculateStudyPriorities } from './study-priority'

// ── Public types ───────────────────────────────────────────────────────────────

export type NotificationType =
  | 'post_class'
  | 'energy_boost'
  | 'exam_alert'
  | 'early_win'
  | 'exam_approaching'
  | 'deadline_approaching'
  | 'exam_today'

/** A notification ready to be persisted to the DB */
export interface PendingNotification {
  type: NotificationType
  /** Legacy single-field message (used for post_class, energy_boost, early_win) */
  message: string
  /** Short title for deadline-type notifications */
  title?: string
  /** Rich body for deadline-type notifications */
  body?: string
  /** Snapshot of academic context at the moment of alert creation */
  context_json?: DeadlineAlertContext
  /** The academic_events.id this alert is for (deadline-type only) */
  event_id?: string
  /** The subjects.id this alert is for (deadline-type only) */
  subject_id?: string
  /** Which day-before trigger fired (14 | 10 | 7 | 5 | 1 | 0) */
  trigger_days_before?: number
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

  // Already-created notifications for today (used for deduplication of legacy types)
  existingTodayNotifications: Array<{
    type: string
    metadata: Record<string, unknown>
  }>

  // Already-sent deadline notifications (used for dedup of new deadline-type alerts)
  // Each entry is { event_id, trigger_days_before }
  existingDeadlineNotifications: Array<{
    event_id: string | null
    trigger_days_before: number | null
  }>

  /** Reference time — injectable for testing (defaults to now) */
  now: Date
}

/** Input for the smart deadline alert evaluator (subset of TriggerInput) */
export interface DeadlineAlertInput {
  subjectsWithDetails: SubjectWithDetails[]
  academicEvents: AcademicEvent[]
  /** All daily plans from today forward (to count planned study sessions) */
  upcomingPlans: DailyPlan[]
  /** Already-sent deadline notifications */
  existingDeadlineNotifications: Array<{
    event_id: string | null
    trigger_days_before: number | null
  }>
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

// ── Trigger 5: Smart deadline alerts (14/10/7/5/1/0 days) ─────────────────────

/** Day-before thresholds that trigger an alert */
const DEADLINE_TRIGGER_DAYS = [14, 10, 7, 5, 1, 0] as const

/**
 * Generates the alert title for a deadline notification.
 * Format: "[Materia] — [Tipo] en N días" or "hoy"
 */
function buildDeadlineTitle(
  subjectName: string,
  eventType: string,
  daysRemaining: number
): string {
  const typeLabel =
    eventType === 'parcial'              ? 'Parcial' :
    eventType === 'parcial_intermedio'   ? 'Parcial Intermedio' :
    eventType === 'entrega_tp'           ? 'Entrega TP' :
    'Evento'

  const whenLabel =
    daysRemaining === 0  ? 'hoy' :
    daysRemaining === 1  ? 'mañana' :
    `en ${daysRemaining} días`

  return `${subjectName} — ${typeLabel} ${whenLabel}`
}

/**
 * Generates the rich body based on context (topic counts + days remaining).
 * Keeps push text concise — no topic lists in the notification body.
 */
function buildDeadlineBody(ctx: DeadlineAlertContext): string {
  const { red_topics = 0, days_remaining = 0 } = ctx

  if (days_remaining === 0) {
    return 'Hoy es el día. Repasá solo los conceptos clave, no empieces temas nuevos.'
  }

  if (days_remaining === 1) {
    return 'Mañana es el día. Repasá solo los conceptos clave, no empieces temas nuevos.'
  }

  if (red_topics === 0) {
    return 'Vas bien. Tenés todos los temas bajo control, seguí con el ritmo actual.'
  }

  if (days_remaining <= 3) {
    return `Modo examen activado. Tenés ${red_topics} tema${red_topics > 1 ? 's' : ''} sin entender — enfocate en esos. Dejá los verdes para repasar el día anterior.`
  }

  if (days_remaining <= 7) {
    return `Atención: tenés ${red_topics} tema${red_topics > 1 ? 's' : ''} sin entender. Priorizalos esta semana.`
  }

  // 10–14 days
  return `Tenés ${red_topics} tema${red_topics > 1 ? 's' : ''} en rojo. Buen momento para avanzar sin presión.`
}

/**
 * Counts planned study sessions for a subject from today until the event date.
 * "Planned" means: a daily_plan block of type=study with matching subject_id,
 * not yet completed.
 */
function countPlannedSessions(
  subjectId: string,
  eventDate: string,
  upcomingPlans: DailyPlan[],
  todayStr: string
): number {
  let count = 0
  for (const plan of upcomingPlans) {
    if (plan.date < todayStr || plan.date > eventDate) continue
    for (const block of plan.plan_json) {
      if (block.type === 'study' && block.subject_id === subjectId && !block.completed) {
        count++
      }
    }
  }
  return count
}

/**
 * Evaluates all academic_events and returns new deadline-type notifications
 * to persist. Runs at check-in time, when events are added, or on topic change.
 *
 * Rules (applied per event):
 *   - Only fires for parcial / parcial_intermedio / entrega_tp events
 *   - Only for events dated in the future (including today)
 *   - Only on exact threshold days: 14, 10, 7, 5, 1, 0
 *   - Dedup: skips if (event_id, trigger_days_before) already in existingDeadlineNotifications
 */
export function checkAndScheduleAlerts(input: DeadlineAlertInput): PendingNotification[] {
  const results: PendingNotification[] = []

  // Build a fast lookup map of subjects by id
  const subjectMap = new Map(input.subjectsWithDetails.map(s => [s.id, s]))

  const todayStr = input.now.toISOString().slice(0, 10)

  for (const event of input.academicEvents) {
    // Only academic exam-type events with a linked subject
    if (!event.subject_id) continue
    if (!['parcial', 'parcial_intermedio', 'entrega_tp'].includes(event.type)) continue
    if (event.date < todayStr) continue

    const daysRemaining = Math.round(
      (new Date(event.date).setHours(0, 0, 0, 0) - new Date(todayStr).setHours(0, 0, 0, 0)) /
      (1000 * 60 * 60 * 24)
    )

    // Only fire on exact threshold days
    if (!(DEADLINE_TRIGGER_DAYS as readonly number[]).includes(daysRemaining)) continue

    // Dedup check
    const alreadySent = input.existingDeadlineNotifications.some(
      n => n.event_id === event.id && n.trigger_days_before === daysRemaining
    )
    if (alreadySent) continue

    const subject = subjectMap.get(event.subject_id)
    if (!subject) continue

    // Count topic statuses
    const allTopics = subject.units.flatMap(u => u.topics)
    const redTopics    = allTopics.filter(t => t.status === 'red').length
    const yellowTopics = allTopics.filter(t => t.status === 'yellow').length
    const greenTopics  = allTopics.filter(t => t.status === 'green').length

    // Count planned study sessions between today and event
    const plannedSessions = countPlannedSessions(
      subject.id,
      event.date,
      input.upcomingPlans,
      todayStr
    )

    const context: DeadlineAlertContext = {
      red_topics:             redTopics,
      yellow_topics:          yellowTopics,
      green_topics:           greenTopics,
      days_remaining:         daysRemaining,
      planned_study_sessions: plannedSessions,
    }

    const title = buildDeadlineTitle(subject.name, event.type, daysRemaining)
    const body  = buildDeadlineBody(context)

    const notifType: NotificationType =
      daysRemaining === 0           ? 'exam_today' :
      event.type === 'entrega_tp'   ? 'deadline_approaching' :
      'exam_approaching'

    // Expires end of the event day (irrelevant after the exam)
    const expiresAt = new Date(event.date)
    expiresAt.setHours(23, 59, 59, 0)

    results.push({
      type:                 notifType,
      message:              `${title}: ${body}`,   // fallback for legacy renders
      title,
      body,
      context_json:         context,
      event_id:             event.id,
      subject_id:           event.subject_id,
      trigger_days_before:  daysRemaining,
      target_path:          `/subjects/${event.subject_id}`,
      expires_at:           expiresAt.toISOString(),
      metadata: {
        subject_name:       subject.name,
        event_type:         event.type,
        event_date:         event.date,
        days_remaining:     daysRemaining,
      },
    })
  }

  return results
}

// ── Main evaluator ──────────────────────────────────────────────────────────────

/**
 * Evaluates all triggers and returns a list of notifications to persist.
 * The caller (API route) is responsible for inserting them into the DB.
 *
 * Order matters for UX: post_class → exam_alert → energy_boost → early_win
 * (most urgent / time-sensitive first)
 *
 * Smart deadline alerts (checkAndScheduleAlerts) are evaluated separately
 * and merged by the API route, so they don't suppress legacy triggers here.
 */
export function evaluateTriggers(input: TriggerInput): PendingNotification[] {
  const results: PendingNotification[] = []

  // 1. Post-class: multiple can fire simultaneously (one per class)
  results.push(...buildPostClassTriggers(input))

  // 2. Exam alert: highest academic urgency (≤7 days, red topics)
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
