import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import TodayClient from './TodayClient'
import { getTodayArg, getDowArg } from '@/lib/utils'
import type { CheckIn, DailyPlan, TimeBlock } from '@/types'

export default async function TodayPage({
  searchParams,
}: {
  searchParams?: { action?: string }
}) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Use Argentina timezone — Vercel runs UTC, Argentina = UTC-3
  const today = getTodayArg()
  const todayDow = getDowArg()

  // ── Onboarding check (new users without work config) ─────
  const { data: userConfig } = await supabase
    .from('user_config')
    .select('*')
    .eq('user_id', user.id)
    .single()

  if (!userConfig) redirect('/onboarding')

  // ── Active semester subject IDs (for event filtering) ────
  // Events should only show for the active semester's subjects
  const { data: activeSemRows } = await supabase
    .from('semesters')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)

  let activeSubjectIds: string[] = []
  if (activeSemRows?.[0]) {
    const { data: semSubs } = await supabase
      .from('subjects')
      .select('id')
      .eq('semester_id', activeSemRows[0].id)
    activeSubjectIds = (semSubs || []).map((s: any) => s.id)
  }

  // ── Parallel DB queries ───────────────────────────────────
  const in30Days = format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')

  // Build events query — scoped to active semester if available
  const eventsBaseQ = supabase
    .from('academic_events')
    .select('*, subjects(name, color)')
    .eq('user_id', user.id)
    .gte('date', today)
    .lte('date', in30Days)
    .order('date', { ascending: true })
    .limit(5)
  const eventsQ = activeSubjectIds.length > 0
    ? eventsBaseQ.in('subject_id', activeSubjectIds)
    : eventsBaseQ

  const [
    { data: checkin },
    { data: plan },
    { data: events },
    { data: energyHistory },
    { data: subjectsForEdit },
  ] = await Promise.all([
    supabase.from('checkins').select('*').eq('user_id', user.id).eq('date', today).single(),
    supabase.from('daily_plans').select('*').eq('user_id', user.id).eq('date', today).single(),
    eventsQ,
    supabase.from('checkins').select('date, energy_level')
      .eq('user_id', user.id).order('date', { ascending: false }).limit(7),
    supabase.from('subjects').select('id, name, color, units(id, name, order_index, topics(id, name, status))')
      .eq('user_id', user.id).order('name'),
  ])

  // ── Preview blocks (when no check-in for today) ───────────
  // Shows work + class schedule as a "preview" until check-in is done
  let previewBlocks: TimeBlock[] = []
  if (!checkin) {
    // Work block
    const workDays: number[] = userConfig.work_days_json || []
    if (workDays.includes(todayDow)) {
      previewBlocks.push({
        id: 'preview_work',
        start_time: userConfig.work_start || '09:00',
        end_time: userConfig.work_end || '18:00',
        type: 'work',
        title: 'Trabajo',
        description: userConfig.work_default_mode === 'presencial'
          ? '🏢 Jornada presencial'
          : userConfig.work_default_mode === 'remoto'
            ? '🏠 Jornada remota'
            : '🔀 Jornada mixta',
        completed: false,
        priority: 'medium',
      })
    }

    // Class blocks for today's day of week
    try {
      const { data: todayClasses } = await supabase
        .from('class_schedule')
        .select('*, subjects(name, color)')
        .eq('user_id', user.id)
        .eq('day_of_week', todayDow)
        .eq('is_active', true)
        .order('start_time')

      for (const cls of todayClasses || []) {
        previewBlocks.push({
          id: `preview_class_${cls.id}`,
          start_time: cls.start_time,
          end_time: cls.end_time,
          type: 'class',
          title: cls.subjects?.name || 'Clase',
          description: cls.modality === 'presencial' ? '🏫 Presencial' : '💻 Virtual',
          completed: false,
          priority: 'high',
        })
      }
    } catch {
      // class_schedule may not exist yet — ignore
    }

    // Sort by start_time
    previewBlocks.sort((a, b) => a.start_time.localeCompare(b.start_time))
  }

  // Sort units by order_index for the edit dropdowns
  const subjectsData = (subjectsForEdit || []).map((s: any) => ({
    ...s,
    units: (s.units || [])
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((u: any) => ({ ...u, topics: u.topics || [] })),
  }))

  return (
    <TodayClient
      user={user}
      checkin={checkin as CheckIn | null}
      plan={plan as DailyPlan | null}
      upcomingEvents={(events || []) as any[]}
      energyHistory={energyHistory || []}
      today={today}
      previewBlocks={previewBlocks}
      actionParam={searchParams?.action}
      subjectsData={subjectsData}
    />
  )
}
