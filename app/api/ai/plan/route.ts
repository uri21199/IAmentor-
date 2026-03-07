import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generateDailyPlan } from '@/lib/anthropic'
import { calculateStudyPriorities } from '@/lib/study-priority'
import { getTodayEvents, refreshAccessToken } from '@/lib/google-calendar'
import { format, subDays } from 'date-fns'
import type { PlanGenerationContext, SubjectWithDetails, TimeBlock } from '@/types'

export async function POST() {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const today = format(new Date(), 'yyyy-MM-dd')
    const todayDow = new Date().getDay() // 0=Sun, 1=Mon, ..., 6=Sat

    // ── 1. Get today's check-in ─────────────────────────────
    const { data: checkin } = await supabase
      .from('checkins')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .single()

    if (!checkin) {
      return NextResponse.json({ error: 'No check-in found for today' }, { status: 400 })
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

    // ── 5. Fixed blocks from user_config + class_schedule ───
    const fixedBlocks: TimeBlock[] = []

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

    // Work block — only if today is a work day and check-in mode isn't no_work/libre
    if (userConfig) {
      const workDays: number[] = userConfig.work_days_json || [1, 2, 3, 4, 5]
      const isWorkDay = workDays.includes(todayDow)
      if (isWorkDay && checkin.work_mode !== 'no_work' && checkin.work_mode !== 'libre') {
        const workTitle = checkin.work_mode === 'presencial' ? '💼 Trabajo presencial' : '🏠 Trabajo remoto'
        fixedBlocks.push({
          id: 'fixed_work',
          start_time: userConfig.work_start,
          end_time: userConfig.work_end,
          type: 'work',
          title: workTitle,
          description: `Horario laboral — ${checkin.work_mode}`,
          completed: false,
          priority: 'medium',
        })
      }
    }

    // Class blocks — one per scheduled class today
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

    // ── 6. Calculate study priorities ──────────────────────
    const studyPriorities = calculateStudyPriorities({
      subjects: subjectsWithDetails,
      academic_events: academicEvents,
    })

    // ── 7. Build context and call Claude ───────────────────
    const context: PlanGenerationContext = {
      checkin,
      calendar_events: calendarEvents,
      subjects_with_topics: subjectsWithDetails,
      academic_events: academicEvents,
      energy_history: energyHistory || [],
      study_priorities: studyPriorities,
      fixed_blocks: fixedBlocks,
    }

    const claudeBlocks = await generateDailyPlan(context)

    // ── 8. Merge fixed + AI blocks, sorted by start time ───
    const allBlocks = [...fixedBlocks, ...claudeBlocks].sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    )

    // ── 9. Save plan to DB ──────────────────────────────────
    await supabase.from('daily_plans').upsert({
      user_id: user.id,
      date: today,
      plan_json: allBlocks,
      completion_percentage: 0,
    })

    return NextResponse.json({ blocks: allBlocks })
  } catch (err: any) {
    console.error('Plan generation error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
