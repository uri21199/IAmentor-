/**
 * fixed-blocks.ts
 *
 * Builds the deterministic fixed blocks for a given day:
 *   - Work block        (from user_config + check-in work_mode)
 *   - Class blocks      (from class_schedule + has_faculty resolution)
 *   - Travel blocks     (from check-in travel_route_json)
 *   - Manually-edited   (preserved from an existing plan)
 *
 * Extracted from /api/ai/plan so both the plan generator and the
 * replan endpoint share identical constraint enforcement.
 *
 * Class resolution rules (EC2 from spec):
 *   - check-in exists  → trust has_faculty exactly (user was explicit)
 *   - no check-in      → if classes are registered for today → assume has_faculty = true
 */

import type { TimeBlock, TravelSegment } from '@/types'

// ── Minimal shapes (avoids importing full DB types into this util) ─────────────

interface AcademicEventLike {
  id: string
  type: string
  title: string
  subject_id: string | null
  notes: string | null
}

interface EffectiveCheckin {
  work_mode: string
  has_faculty: boolean
  travel_route_json: TravelSegment[]
}

interface UserConfigLike {
  work_days_json: number[]
  work_start: string
  work_end: string
}

interface ClassScheduleEntryLike {
  id: string
  start_time: string
  end_time: string
  modality: string
  subject_id: string
  subjects?: { name: string; color: string } | null
}

// ── Time arithmetic helpers ───────────────────────────────────────────────────

function addMins(t: string, m: number): string {
  const [h, min] = t.split(':').map(Number)
  const tot = h * 60 + min + m
  return `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`
}

function subMins(t: string, m: number): string {
  const [h, min] = t.split(':').map(Number)
  const tot = Math.max(0, h * 60 + min - m)
  return `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`
}

// ── Public result type ────────────────────────────────────────────────────────

export interface FixedBlocksResult {
  fixedBlocks: TimeBlock[]
  travelBlockIds: string[]
}

// ── Main export ───────────────────────────────────────────────────────────────

/** Parses the `time` field from an academic event's notes JSON (e.g. "10:30") */
function parseEventTime(notes: string | null): string | null {
  if (!notes) return null
  try {
    const parsed = JSON.parse(notes)
    return typeof parsed?.time === 'string' ? parsed.time : null
  } catch {
    return null
  }
}

/** Default exam duration in minutes by event type */
const EXAM_DURATION: Record<string, number> = {
  parcial:            120,
  parcial_intermedio: 90,
  entrega_tp:         60,
}

/**
 * @param todayDow              0=Sun … 6=Sat (Argentina timezone)
 * @param effectiveCheckin      check-in data (real or fallback defaults)
 * @param checkinExists         true when a real check-in row exists in DB
 * @param userConfig            user_config row (null if not yet configured)
 * @param todayClasses          class_schedule rows active for today's day_of_week
 * @param manuallyEditedBlocks  blocks from the existing plan that were manually edited
 * @param todayAcademicEvent    important academic event for today (parcial, TP, etc.) — optional
 */
export function buildFixedBlocks(
  todayDow: number,
  effectiveCheckin: EffectiveCheckin,
  checkinExists: boolean,
  userConfig: UserConfigLike | null,
  todayClasses: ClassScheduleEntryLike[],
  manuallyEditedBlocks: TimeBlock[],
  todayAcademicEvent: AcademicEventLike | null = null,
): FixedBlocksResult {
  const fixedBlocks: TimeBlock[] = [...manuallyEditedBlocks]

  // ── Work block ──────────────────────────────────────────────────────────────
  if (userConfig) {
    const workDays: number[] = userConfig.work_days_json?.length
      ? userConfig.work_days_json
      : [1, 2, 3, 4, 5]
    const isWorkDay = workDays.includes(todayDow)
    const isWorking =
      effectiveCheckin.work_mode !== 'no_work' &&
      effectiveCheckin.work_mode !== 'libre'

    if (isWorkDay && isWorking) {
      const workTitle =
        effectiveCheckin.work_mode === 'presencial'
          ? '💼 Trabajo presencial'
          : '🏠 Trabajo remoto'
      fixedBlocks.push({
        id: 'fixed_work',
        start_time: userConfig.work_start,
        end_time: userConfig.work_end,
        type: 'work',
        title: workTitle,
        description: `Horario laboral — ${effectiveCheckin.work_mode}`,
        completed: false,
        priority: 'medium',
      })
    }
  }

  // ── Academic event block (parcial, TP, etc.) ────────────────────────────────
  // If today's important event has a time in its notes, place it on the timeline.
  // If its subject_id matches a class scheduled today, that class will be skipped
  // (the exam block takes the slot).
  const eventTime = todayAcademicEvent ? parseEventTime(todayAcademicEvent.notes) : null
  const examSubjectId = todayAcademicEvent?.subject_id ?? null

  // Which class ids are replaced by the exam (same subject)
  const replacedClassIds = new Set<string>()

  if (todayAcademicEvent && eventTime) {
    const duration = EXAM_DURATION[todayAcademicEvent.type] ?? 60
    const eventEnd = addMins(eventTime, duration)

    // Find class(es) with the same subject to remove
    for (const cls of todayClasses) {
      if (examSubjectId && cls.subject_id === examSubjectId) {
        replacedClassIds.add(cls.id)
      }
    }

    const typeLabel: Record<string, string> = {
      parcial:            'Parcial',
      parcial_intermedio: 'Parcial Intermedio',
      entrega_tp:         'Entrega TP',
    }
    fixedBlocks.push({
      id: 'fixed_academic_event',
      start_time: eventTime,
      end_time: eventEnd,
      type: 'exam',
      title: todayAcademicEvent.title || (typeLabel[todayAcademicEvent.type] ?? 'Evento académico'),
      description: `${typeLabel[todayAcademicEvent.type] ?? 'Evento'} — ${duration} min`,
      subject_id: examSubjectId ?? undefined,
      completed: false,
      priority: 'high',
    })
  } else if (todayAcademicEvent && examSubjectId) {
    // No time info but same subject → still replace the class block with an exam block
    // using the class's own time slot.
    for (const cls of todayClasses) {
      if (cls.subject_id === examSubjectId) {
        replacedClassIds.add(cls.id)
        fixedBlocks.push({
          id: `fixed_academic_event_${cls.id}`,
          start_time: cls.start_time,
          end_time: cls.end_time,
          type: 'exam',
          title: todayAcademicEvent.title,
          description: `Parcial en el horario de clase — ${cls.subjects?.name ?? 'Materia'}`,
          subject_id: examSubjectId,
          completed: false,
          priority: 'high',
        })
      }
    }
  }

  // ── Class blocks ────────────────────────────────────────────────────────────
  // If the user completed a check-in, trust has_faculty (they were explicit).
  // If there is no check-in, fall back to "has classes in schedule = has faculty".
  const resolvedHasFaculty = checkinExists
    ? effectiveCheckin.has_faculty
    : todayClasses.length > 0

  if (resolvedHasFaculty) {
    for (const cls of todayClasses) {
      if (replacedClassIds.has(cls.id)) continue  // replaced by exam block
      fixedBlocks.push({
        id: `fixed_class_${cls.id}`,
        start_time: cls.start_time,
        end_time: cls.end_time,
        type: 'class',
        title: `Clase: ${cls.subjects?.name ?? 'Materia'}`,
        description: `${cls.modality === 'presencial' ? '🏫 Presencial' : '💻 Virtual'} — ${cls.subjects?.name ?? 'Materia'}`,
        subject_id: cls.subject_id,
        completed: false,
        priority: 'high',
      })
    }
  }

  // ── Travel blocks ───────────────────────────────────────────────────────────
  const travelSegments: TravelSegment[] = effectiveCheckin.travel_route_json ?? []
  const travelBlockIds: string[] = []

  if (travelSegments.length > 0) {
    const sortedFixed = [...fixedBlocks].sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    )
    const firstStart = sortedFixed[0]?.start_time ?? '09:00'
    const lastEnd = sortedFixed[sortedFixed.length - 1]?.end_time ?? '18:00'

    // All segments except the last → departure travel (placed before first fixed block)
    const preSegs = travelSegments.slice(0, -1)
    const totalPreMins = preSegs.reduce((s, seg) => s + seg.duration_minutes, 0)
    let cursor = subMins(firstStart, totalPreMins)

    preSegs.forEach((seg, i) => {
      const end = addMins(cursor, seg.duration_minutes)
      const id = `travel_${i + 1}`
      travelBlockIds.push(id)
      fixedBlocks.push({
        id,
        start_time: cursor,
        end_time: end,
        type: 'travel',
        title: `🚌 ${seg.origin} → ${seg.destination}`,
        description: `Viaje ${seg.duration_minutes} min — repasá teoría mientras viajás`,
        travel_segment: seg,
        completed: false,
        priority: 'low',
      })
      cursor = end
    })

    // Last segment → return travel (placed right after last fixed block ends)
    const returnSeg = travelSegments[travelSegments.length - 1]
    const returnId = `travel_${travelSegments.length}`
    travelBlockIds.push(returnId)
    fixedBlocks.push({
      id: returnId,
      start_time: lastEnd,
      end_time: addMins(lastEnd, returnSeg.duration_minutes),
      type: 'travel',
      title: `🚌 ${returnSeg.origin} → ${returnSeg.destination}`,
      description: `Viaje ${returnSeg.duration_minutes} min — repasá teoría mientras viajás`,
      travel_segment: returnSeg,
      completed: false,
      priority: 'low',
    })
  }

  return { fixedBlocks, travelBlockIds }
}
