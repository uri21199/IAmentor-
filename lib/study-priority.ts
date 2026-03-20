/**
 * study-priority.ts
 * Pure, testable study prioritization logic.
 * No side effects, no DB calls — only pure functions.
 */

import { differenceInDays, parseISO } from 'date-fns'
import type {
  AcademicEvent,
  Subject,
  Topic,
  SubjectWithDetails,
  StudyPriorityResult,
  TopicStatus,
} from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export type StudyMode = 'exam_prep' | 'active_review' | 'normal' | 'light'

export interface PriorityInput {
  subjects: SubjectWithDetails[]
  academic_events: AcademicEvent[]
  reference_date?: Date  // defaults to today — injectable for testing
  /**
   * Pre-computed boost scores per topic ID, derived from recent class logs.
   * Build this map with buildClassLogBoosts() before calling calculateStudyPriorities().
   */
  class_log_boosts?: Map<string, number>
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WEIGHT = {
  EXAM_MODE_THRESHOLD: 3,        // ≤3 days → exam mode
  ACTIVE_REVIEW_THRESHOLD: 7,    // ≤7 days → active review
  HIGH_PRIORITY_THRESHOLD: 14,   // ≤14 days → high priority
  RED_TOPIC_SCORE: 10,
  YELLOW_TOPIC_SCORE: 5,
  GREEN_TOPIC_SCORE: 1,
  EVENT_WEIGHT: {
    parcial: 30,
    parcial_intermedio: 20,
    entrega_tp: 15,
  },
} as const

// ── Core calculation ──────────────────────────────────────────────────────────

/**
 * Returns score contribution from upcoming academic events.
 * Higher score = more urgent.
 */
export function calculateEventUrgencyScore(
  events: AcademicEvent[],
  subjectId: string,
  referenceDate: Date
): { score: number; daysToEvent: number | null; eventType: AcademicEvent['type'] | null } {
  const subjectEvents = events
    .filter(e => e.subject_id === subjectId)
    .map(e => ({
      ...e,
      days: differenceInDays(parseISO(e.date), referenceDate),
    }))
    .filter(e => e.days >= 0)  // only future events
    .sort((a, b) => a.days - b.days)

  if (subjectEvents.length === 0) {
    return { score: 0, daysToEvent: null, eventType: null }
  }

  const nearest = subjectEvents[0]
  const days = nearest.days
  const baseWeight = WEIGHT.EVENT_WEIGHT[nearest.type]

  let urgencyMultiplier: number
  if (days <= WEIGHT.EXAM_MODE_THRESHOLD) {
    urgencyMultiplier = 5
  } else if (days <= WEIGHT.ACTIVE_REVIEW_THRESHOLD) {
    urgencyMultiplier = 3
  } else if (days <= WEIGHT.HIGH_PRIORITY_THRESHOLD) {
    urgencyMultiplier = 1.5
  } else {
    urgencyMultiplier = 0.5
  }

  return {
    score: baseWeight * urgencyMultiplier,
    daysToEvent: days,
    eventType: nearest.type,
  }
}

/**
 * Returns score contribution from topic comprehension status.
 *
 * When referenceDate is provided, red topics also receive a stagnation bonus:
 * +0.5 per day without studying, capped at +15. A topic never studied counts
 * as 30 days stagnant (maximum penalty).
 *
 * When classLogBoosts is provided, each topic's individual boost (from recent
 * class exposure with low understanding) is added on top.
 */
export function calculateTopicWeaknessScore(
  topics: Topic[],
  referenceDate?: Date,
  classLogBoosts?: Map<string, number>,
): number {
  return topics.reduce((acc, topic) => {
    let score = 0

    switch (topic.status as TopicStatus) {
      case 'red': {
        score = WEIGHT.RED_TOPIC_SCORE
        if (referenceDate) {
          const daysSince = topic.last_studied
            ? differenceInDays(referenceDate, parseISO(topic.last_studied))
            : 30  // never studied → treat as 30 days stagnant
          score += Math.min(daysSince * 0.5, 15)
        }
        break
      }
      case 'yellow':
        score = WEIGHT.YELLOW_TOPIC_SCORE
        break
      case 'green':
        score = WEIGHT.GREEN_TOPIC_SCORE
        break
      default:
        break
    }

    // Class log boost: recently seen in class with low understanding → bumps priority
    if (classLogBoosts?.has(topic.id)) {
      score += classLogBoosts.get(topic.id)!
    }

    return acc + score
  }, 0)
}

/**
 * Builds a Map<topicId, boostScore> from recent class logs.
 *
 * Boost formula per log entry:
 *   boost = (5 - understanding_level) * recencyFactor * 8
 *   recencyFactor = max(0, 1 - daysAgo / 14)
 *
 * Examples:
 *   - Seen 1 day ago, understanding 1/5 → boost ≈ 32
 *   - Seen 7 days ago, understanding 3/5 → boost ≈ 8
 *   - Seen 14+ days ago → boost = 0 (decayed)
 *
 * Multiple logs for the same topic accumulate.
 */
export function buildClassLogBoosts(
  classLogs: Array<{ date: string; understanding_level: number; topics_covered_json: string[] }>,
  referenceDate: Date,
): Map<string, number> {
  const boosts = new Map<string, number>()

  for (const log of classLogs) {
    const daysAgo = differenceInDays(referenceDate, parseISO(log.date))
    if (daysAgo < 0) continue  // future-dated logs — skip

    const recencyFactor = Math.max(0, 1 - daysAgo / 14)
    if (recencyFactor === 0) continue  // fully decayed

    const boost = (5 - log.understanding_level) * recencyFactor * 8

    for (const topicId of log.topics_covered_json) {
      boosts.set(topicId, (boosts.get(topicId) ?? 0) + boost)
    }
  }

  return boosts
}

/**
 * Determines study mode based on days to event.
 */
export function determineStudyMode(daysToEvent: number | null): StudyMode {
  if (daysToEvent === null) return 'normal'
  if (daysToEvent <= WEIGHT.EXAM_MODE_THRESHOLD) return 'exam_prep'
  if (daysToEvent <= WEIGHT.ACTIVE_REVIEW_THRESHOLD) return 'active_review'
  if (daysToEvent <= WEIGHT.HIGH_PRIORITY_THRESHOLD) return 'normal'
  return 'light'
}

/**
 * Returns topics ordered by priority: red first, then yellow, then green.
 * Within same status, older last_studied comes first (or never studied).
 */
export function getTopicsByPriority(topics: Topic[]): Topic[] {
  const statusOrder: Record<TopicStatus, number> = { red: 0, yellow: 1, green: 2 }

  return [...topics].sort((a, b) => {
    const statusDiff = statusOrder[a.status as TopicStatus] - statusOrder[b.status as TopicStatus]
    if (statusDiff !== 0) return statusDiff

    // Same status: unstudied > older last_studied
    if (!a.last_studied && !b.last_studied) return 0
    if (!a.last_studied) return -1
    if (!b.last_studied) return 1

    return parseISO(a.last_studied).getTime() - parseISO(b.last_studied).getTime()
  })
}

/**
 * Main function: calculates study priority for each subject.
 * Returns results ordered by priority_score descending.
 */
export function calculateStudyPriorities(input: PriorityInput): StudyPriorityResult[] {
  const referenceDate = input.reference_date ?? new Date()
  const results: StudyPriorityResult[] = []

  for (const subject of input.subjects) {
    const allTopics = subject.units.flatMap(u => u.topics)

    const { score: eventScore, daysToEvent, eventType } = calculateEventUrgencyScore(
      input.academic_events,
      subject.id,
      referenceDate
    )

    const weaknessScore = calculateTopicWeaknessScore(
      allTopics,
      referenceDate,
      input.class_log_boosts,
    )
    const priorityScore = eventScore + weaknessScore

    const studyMode = determineStudyMode(daysToEvent)

    const orderedTopics = getTopicsByPriority(allTopics)
    const weakTopics = orderedTopics.filter(t => t.status === 'red' || t.status === 'yellow')

    // In exam mode: only red + yellow topics; otherwise top-6 by priority
    let recommendedTopics: Topic[]
    if (studyMode === 'exam_prep') {
      recommendedTopics = weakTopics.slice(0, 5)
    } else if (studyMode === 'active_review') {
      recommendedTopics = orderedTopics.slice(0, 4)
    } else {
      recommendedTopics = orderedTopics.slice(0, 3)
    }

    const overallPriority =
      daysToEvent !== null && daysToEvent <= WEIGHT.EXAM_MODE_THRESHOLD ? 'exam' :
      daysToEvent !== null && daysToEvent <= WEIGHT.ACTIVE_REVIEW_THRESHOLD ? 'high' :
      daysToEvent !== null && daysToEvent <= WEIGHT.HIGH_PRIORITY_THRESHOLD ? 'medium' :
      'low'

    results.push({
      subject_id: subject.id,
      subject_name: subject.name,
      priority: overallPriority,
      priority_score: priorityScore,
      days_to_event: daysToEvent,
      event_type: eventType,
      weak_topics: weakTopics,
      recommended_topics: recommendedTopics,
      study_mode: studyMode,
    })
  }

  return results.sort((a, b) => b.priority_score - a.priority_score)
}

/**
 * Returns the best topic to study during a travel segment.
 * Only theory-appropriate topics (not exam-mode practice exercises).
 */
export function selectTravelStudyTopic(
  priorities: StudyPriorityResult[],
  durationMinutes: number
): { subject_name: string; topic_name: string; mode: string } | null {
  // Find the highest priority subject that has weak topics
  const candidate = priorities.find(p => p.weak_topics.length > 0)
  if (!candidate) return null

  const topic = candidate.weak_topics[0]

  const modeText =
    durationMinutes <= 20 ? 'Lectura rápida y conceptos clave' :
    durationMinutes <= 40 ? 'Lectura activa con notas mentales' :
    'Lectura activa con anotaciones'

  return {
    subject_name: candidate.subject_name,
    topic_name: topic.name,
    mode: modeText,
  }
}

/**
 * Returns color for days remaining display.
 */
export function getDaysColor(days: number): 'green' | 'amber' | 'red' {
  if (days > 14) return 'green'
  if (days > 7) return 'amber'
  return 'red'
}

/**
 * Returns label for academic event type.
 */
export function getEventTypeLabel(type: AcademicEvent['type']): string {
  switch (type) {
    case 'parcial': return 'Parcial'
    case 'parcial_intermedio': return 'Parcial Intermedio'
    case 'entrega_tp': return 'Entrega TP'
    default: return type
  }
}
