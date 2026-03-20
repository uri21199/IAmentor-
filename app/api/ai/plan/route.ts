import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generateDailyPlanStream } from '@/lib/anthropic'
import { calculateStudyPriorities, buildClassLogBoosts } from '@/lib/study-priority'
import { buildFixedBlocks } from '@/lib/fixed-blocks'
import { getTodayEvents, refreshAccessToken } from '@/lib/google-calendar'
import { format, subDays, addDays, differenceInDays, parseISO } from 'date-fns'
import { getTodayArg, getDowArg } from '@/lib/utils'
import type {
  PlanGenerationContext,
  SubjectWithDetails,
  TimeBlock,
  AcademicEvent,
  RecentClassLog,
  MicroReview,
} from '@/types'

/** SSE helper – encodes a single event into a Uint8Array */
function sseEvent(event: string, data: string): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${data}\n\n`)
}

/** Event types considered academically important for plan adjustments */
const ACADEMIC_EVENT_TYPES = ['parcial', 'parcial_intermedio', 'entrega_tp'] as const

export async function POST() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  // Use Argentina timezone — Vercel runs UTC, Argentina = UTC-3
  const today = getTodayArg()
  const todayDow = getDowArg() // 0=Sun, 1=Mon, ..., 6=Sat
  const referenceDate = new Date()

  // ── 1. Get today's check-in ─────────────────────────────
  const { data: checkin } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  const checkinExists = !!checkin

  const effectiveCheckin = checkin ?? {
    energy_level: 3,
    stress_level: 'low' as const,
    work_mode: 'remoto' as const,
    has_faculty: false,
    faculty_mode: null,
    faculty_subject: null,
    travel_route_json: [] as any[],
    unexpected_events: null,
    sleep_quality: 3,
  }

  // ── 2. Get active semester with subjects + topics ────────
  const { data: semester } = await supabase
    .from('semesters')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  let subjectsWithDetails: SubjectWithDetails[] = []
  let academicEvents: AcademicEvent[] = []

  if (semester) {
    const { data: subjects } = await supabase
      .from('subjects')
      .select(`
        id, name, color, semester_id, user_id, created_at,
        units (
          id, name, order_index, subject_id, created_at,
          topics (
            id, name, full_description, status, last_studied, next_review, created_at, unit_id
          )
        )
      `)
      .eq('semester_id', semester.id)

    subjectsWithDetails = ((subjects as any[]) || []).map(s => ({
      ...s,
      upcoming_events: [],
      units: (s.units || [])
        .sort((a: any, b: any) => a.order_index - b.order_index)
        .map((u: any) => ({ ...u, topics: u.topics || [] })),
    }))

    const { data: events } = await supabase
      .from('academic_events')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', today)
      .lte('date', format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'))
      .order('date')

    academicEvents = (events || []) as AcademicEvent[]
  }

  // ── 3. Today's and near-future important events ─────────
  const tomorrow   = format(addDays(referenceDate, 1), 'yyyy-MM-dd')
  const dayAfter   = format(addDays(referenceDate, 2), 'yyyy-MM-dd')

  const todayAcademicEvent = academicEvents.find(
    e => e.date === today && ACADEMIC_EVENT_TYPES.includes(e.type as any)
  ) ?? null

  const nextTwoDaysHaveEvent = academicEvents.some(
    e => (e.date === tomorrow || e.date === dayAfter) &&
         ACADEMIC_EVENT_TYPES.includes(e.type as any)
  )

  // Suppress study blocks when user has an exam/TP today but nothing critical coming up:
  // their cognitive energy is concentrated on the present event, not future preparation.
  const suppressStudyBlocks = todayAcademicEvent !== null && !nextTwoDaysHaveEvent

  // ── 4. Energy history (last 7 days) ─────────────────────
  const { data: energyHistory } = await supabase
    .from('checkins')
    .select('date, energy_level')
    .eq('user_id', user.id)
    .gte('date', format(subDays(referenceDate, 7), 'yyyy-MM-dd'))
    .order('date')

  // ── 5. Google Calendar events ───────────────────────────
  let calendarEvents: any[] = []
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider', 'google_calendar')
    .single()

  if (integration?.access_token) {
    try {
      let accessToken = integration.access_token
      if (integration.token_expiry && new Date(integration.token_expiry) < new Date()) {
        accessToken = await refreshAccessToken(integration.refresh_token)
        await supabase
          .from('user_integrations')
          .update({ access_token: accessToken, token_expiry: new Date(Date.now() + 3600000).toISOString() })
          .eq('id', integration.id)
      }
      calendarEvents = await getTodayEvents(accessToken, integration.refresh_token)
    } catch (err) {
      console.error('Calendar fetch error:', err)
    }
  }

  // ── 6. Recent class logs (last 14 days) ─────────────────
  const fourteenDaysAgo = format(subDays(referenceDate, 14), 'yyyy-MM-dd')
  const { data: rawClassLogs } = await supabase
    .from('class_logs')
    .select('subject_id, date, topics_covered_json, understanding_level')
    .eq('user_id', user.id)
    .gte('date', fourteenDaysAgo)
    .order('date', { ascending: false })

  // Build a flat topic-ID → topic-object map across all subjects
  const allTopicsMap = new Map<string, { id: string; name: string }>()
  for (const subject of subjectsWithDetails) {
    for (const unit of subject.units) {
      for (const topic of unit.topics) {
        allTopicsMap.set(topic.id, { id: topic.id, name: topic.name })
      }
    }
  }

  const subjectNameMap = new Map<string, string>(
    subjectsWithDetails.map(s => [s.id, s.name])
  )

  const recentClassLogs: RecentClassLog[] = (rawClassLogs ?? []).map(log => ({
    subject_id: log.subject_id,
    subject_name: subjectNameMap.get(log.subject_id) ?? 'Materia desconocida',
    date: log.date,
    days_ago: differenceInDays(referenceDate, parseISO(log.date)),
    understanding_level: log.understanding_level,
    topics: (log.topics_covered_json as string[])
      .map(id => allTopicsMap.get(id))
      .filter((t): t is { id: string; name: string } => t !== undefined),
  }))

  const classLogBoosts = buildClassLogBoosts(rawClassLogs ?? [], referenceDate)

  // ── 7. Load existing plan + user config + classes ────────
  const [{ data: existingPlan }, { data: userConfig }, { data: todayClasses }] =
    await Promise.all([
      supabase
        .from('daily_plans')
        .select('plan_json, completion_percentage')
        .eq('user_id', user.id)
        .eq('date', today)
        .single(),
      supabase.from('user_config').select('*').eq('user_id', user.id).single(),
      supabase
        .from('class_schedule')
        .select('*, subjects(name, color)')
        .eq('user_id', user.id)
        .eq('day_of_week', todayDow)
        .eq('is_active', true)
        .order('start_time'),
    ])

  // ── 8. Preserve completed and manually-edited blocks ────
  const existingPlanBlocks: TimeBlock[] = existingPlan?.plan_json ?? []
  const existingBlockById = new Map(existingPlanBlocks.map(b => [b.id, b]))

  // Manually-edited blocks are kept as fixed (existing behavior)
  const manuallyEditedBlocks = existingPlanBlocks.filter(b => b.manually_edited && !b.deleted)

  // Completed AI-generated blocks are also kept as fixed — they represent
  // work already done and must NOT be discarded or regenerated.
  // Fixed/travel blocks are excluded here because they are rebuilt by buildFixedBlocks
  // and get their completed state restored individually below.
  const completedAiBlocks = existingPlanBlocks.filter(b =>
    b.completed &&
    !b.deleted &&
    !b.manually_edited &&
    !b.id.startsWith('fixed_') &&
    !b.id.startsWith('travel_')
  )

  const preservedBlocks = [...manuallyEditedBlocks, ...completedAiBlocks]

  // ── 9. Build fixed blocks (work + classes + travel + exam) ─
  const { fixedBlocks, travelBlockIds } = buildFixedBlocks(
    todayDow,
    effectiveCheckin,
    checkinExists,
    userConfig,
    todayClasses ?? [],
    preservedBlocks,
    todayAcademicEvent,
  )

  // Restore completed state for structural fixed blocks (work, class, travel)
  // so a completed work/class block stays completed after regeneration.
  for (const block of fixedBlocks) {
    const prev = existingBlockById.get(block.id)
    if (prev?.completed) block.completed = true
  }

  // ── 10. Calculate study priorities ─────────────────────
  const studyPriorities = calculateStudyPriorities({
    subjects: subjectsWithDetails,
    academic_events: academicEvents,
    reference_date: referenceDate,
    class_log_boosts: classLogBoosts,
  })

  // ── 11. Build full context ──────────────────────────────
  const context: PlanGenerationContext = {
    checkin: effectiveCheckin as any,
    calendar_events: calendarEvents,
    subjects_with_topics: subjectsWithDetails,
    academic_events: academicEvents,
    energy_history: energyHistory || [],
    study_priorities: studyPriorities,
    fixed_blocks: fixedBlocks,
    recent_class_logs: recentClassLogs,
    today_academic_event: todayAcademicEvent,
    suppress_study_blocks: suppressStudyBlocks,
  }

  // ── 12. Stream SSE response ─────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(sseEvent(event, JSON.stringify(data)))
      }

      try {
        // Immediately send all fixed blocks so the UI renders them right away
        send('fixed_blocks', fixedBlocks)

        // Stream Claude-generated blocks progressively
        const claudeBlocks: TimeBlock[] = []

        for await (const item of generateDailyPlanStream(context, travelBlockIds)) {
          if ((item as any).type === 'travel_micro_review') {
            const ev = item as { type: 'travel_micro_review'; travel_block_id: string; micro_review: MicroReview }
            send('update_block', { id: ev.travel_block_id, micro_review: ev.micro_review })
          } else {
            const block = item as TimeBlock
            if (!block.id) block.id = `block_${claudeBlocks.length + 1}`
            claudeBlocks.push(block)
            send('block', block)
          }
        }

        // Merge and sort all blocks
        const allBlocks = [...fixedBlocks, ...claudeBlocks].sort((a, b) =>
          a.start_time.localeCompare(b.start_time)
        )

        // Recalculate completion % from actual completed state of all blocks
        const activeBlocks = allBlocks.filter(b => !b.deleted)
        const completionPct = activeBlocks.length > 0
          ? Math.round((activeBlocks.filter(b => b.completed).length / activeBlocks.length) * 100)
          : 0

        await supabase.from('daily_plans').upsert({
          user_id: user!.id,
          date: today,
          plan_json: allBlocks,
          completion_percentage: completionPct,
        })

        send('done', 'complete')
      } catch (err: any) {
        console.error('Plan stream error:', err)
        send('error', { message: err.message ?? 'Error generating plan' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
