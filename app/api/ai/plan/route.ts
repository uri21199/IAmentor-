import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generateDailyPlanStream } from '@/lib/anthropic'
import { calculateStudyPriorities } from '@/lib/study-priority'
import { getTodayEvents, refreshAccessToken } from '@/lib/google-calendar'
import { format, subDays } from 'date-fns'
import { getTodayArg, getDowArg } from '@/lib/utils'
import type { PlanGenerationContext, SubjectWithDetails, TimeBlock, TravelSegment, MicroReview } from '@/types'

/** SSE helper – encodes a single event into a Uint8Array */
function sseEvent(event: string, data: string): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${data}\n\n`)
}

export async function POST() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  // Use Argentina timezone — Vercel runs UTC, Argentina = UTC-3
  const today = getTodayArg()
  const todayDow = getDowArg() // 0=Sun, 1=Mon, ..., 6=Sat

  // ── 1. Get today's check-in ─────────────────────────────
  const { data: checkin } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

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

  // ── 2. Get active semester with subjects ────────────────
  const { data: semester } = await supabase
    .from('semesters')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  let subjectsWithDetails: SubjectWithDetails[] = []
  let academicEvents: any[] = []

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

    academicEvents = events || []
  }

  // ── 3. Energy history (last 7 days) ─────────────────────
  const { data: energyHistory } = await supabase
    .from('checkins')
    .select('date, energy_level')
    .eq('user_id', user.id)
    .gte('date', format(subDays(new Date(), 7), 'yyyy-MM-dd'))
    .order('date')

  // ── 4. Google Calendar events ───────────────────────────
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

  // ── 5. Manually-edited blocks from existing plan ────────
  const { data: existingPlan } = await supabase
    .from('daily_plans')
    .select('plan_json, completion_percentage')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  const manuallyEditedBlocks: TimeBlock[] = (existingPlan?.plan_json ?? [])
    .filter((b: TimeBlock) => b.manually_edited && !b.deleted)

  // ── 5b. Fixed blocks from user_config + class_schedule ──
  const fixedBlocks: TimeBlock[] = [...manuallyEditedBlocks]

  const [{ data: userConfig }, { data: todayClasses }] = await Promise.all([
    supabase.from('user_config').select('*').eq('user_id', user.id).single(),
    supabase
      .from('class_schedule')
      .select('*, subjects(name, color)')
      .eq('user_id', user.id)
      .eq('day_of_week', todayDow)
      .eq('is_active', true)
      .order('start_time'),
  ])

  if (userConfig) {
    const workDays: number[] = userConfig.work_days_json || [1, 2, 3, 4, 5]
    const isWorkDay = workDays.includes(todayDow)
    if (isWorkDay && effectiveCheckin.work_mode !== 'no_work' && effectiveCheckin.work_mode !== 'libre') {
      const workTitle = effectiveCheckin.work_mode === 'presencial' ? '💼 Trabajo presencial' : '🏠 Trabajo remoto'
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

  for (const cls of (todayClasses || [])) {
    fixedBlocks.push({
      id: `fixed_class_${cls.id}`,
      start_time: cls.start_time,
      end_time: cls.end_time,
      type: 'class',
      title: `Clase: ${cls.subjects?.name || 'Materia'}`,
      description: `${cls.modality === 'presencial' ? '🏫 Presencial' : '💻 Virtual'} — ${cls.subjects?.name || 'Materia'}`,
      subject_id: cls.subject_id,
      completed: false,
      priority: 'high',
    })
  }

  // ── 5c. Travel blocks (deterministic) ──────────────────
  const addMins = (t: string, m: number): string => {
    const [h, min] = t.split(':').map(Number)
    const tot = h * 60 + min + m
    return `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`
  }
  const subMins = (t: string, m: number): string => {
    const [h, min] = t.split(':').map(Number)
    const tot = Math.max(0, h * 60 + min - m)
    return `${String(Math.floor(tot / 60)).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`
  }

  const travelSegments: TravelSegment[] = effectiveCheckin.travel_route_json || []
  const travelBlockIds: string[] = []

  if (travelSegments.length > 0) {
    const sortedFixed = [...fixedBlocks].sort((a, b) => a.start_time.localeCompare(b.start_time))
    const firstStart = sortedFixed[0]?.start_time || '09:00'
    const lastEnd = sortedFixed[sortedFixed.length - 1]?.end_time || '18:00'

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

  // ── 6. Calculate study priorities ──────────────────────
  const studyPriorities = calculateStudyPriorities({
    subjects: subjectsWithDetails,
    academic_events: academicEvents,
  })

  // ── 7. Build context ────────────────────────────────────
  const context: PlanGenerationContext = {
    checkin: effectiveCheckin as any,
    calendar_events: calendarEvents,
    subjects_with_topics: subjectsWithDetails,
    academic_events: academicEvents,
    energy_history: energyHistory || [],
    study_priorities: studyPriorities,
    fixed_blocks: fixedBlocks,
  }

  const existingCompletion = existingPlan?.completion_percentage ?? 0

  // ── 8. Stream SSE response ──────────────────────────────
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
            // Attach micro_review to the corresponding travel block and send update
            const ev = item as { type: 'travel_micro_review'; travel_block_id: string; micro_review: MicroReview }
            send('update_block', { id: ev.travel_block_id, micro_review: ev.micro_review })
          } else {
            const block = item as TimeBlock
            claudeBlocks.push(block)
            send('block', block)
          }
        }

        // Save merged plan to DB (fire-and-forget inside the stream)
        const allBlocks = [...fixedBlocks, ...claudeBlocks].sort((a, b) =>
          a.start_time.localeCompare(b.start_time)
        )
        await supabase.from('daily_plans').upsert({
          user_id: user!.id,
          date: today,
          plan_json: allBlocks,
          completion_percentage: existingCompletion,
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
      'X-Accel-Buffering': 'no', // Disable Nginx buffering on Vercel
    },
  })
}
