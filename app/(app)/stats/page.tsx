import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { format, subDays } from 'date-fns'
import StatsClient from './StatsClient'

export default async function StatsPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = format(new Date(), 'yyyy-MM-dd')
  const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd')
  const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')

  // Fetch last 30 days of check-ins
  const { data: checkins } = await supabase
    .from('checkins')
    .select('date, sleep_quality, energy_level, stress_level')
    .eq('user_id', user.id)
    .gte('date', thirtyDaysAgo)
    .order('date', { ascending: true })

  // Fetch daily plans for completion
  const { data: plans } = await supabase
    .from('daily_plans')
    .select('date, completion_percentage')
    .eq('user_id', user.id)
    .gte('date', thirtyDaysAgo)
    .order('date', { ascending: true })

  // Fetch workouts
  const { data: workouts } = await supabase
    .from('workouts')
    .select('date, type, completed, duration_minutes')
    .eq('user_id', user.id)
    .gte('date', thirtyDaysAgo)
    .order('date', { ascending: true })

  // Travel logs
  const { data: travelLogs } = await supabase
    .from('travel_logs')
    .select('date, segments_json, studied_during_json')
    .eq('user_id', user.id)
    .gte('date', thirtyDaysAgo)

  // Active semester subjects with topic status
  const { data: semester } = await supabase
    .from('semesters')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  let subjectProgress: any[] = []
  if (semester) {
    const { data: subjects } = await supabase
      .from('subjects')
      .select(`
        id, name, color,
        units (
          topics (status)
        )
      `)
      .eq('semester_id', semester.id)
      .order('name')

    subjectProgress = (subjects || []).map((s: any) => {
      const topics = s.units?.flatMap((u: any) => u.topics) || []
      const total = topics.length
      const green = topics.filter((t: any) => t.status === 'green').length
      const yellow = topics.filter((t: any) => t.status === 'yellow').length
      const red = topics.filter((t: any) => t.status === 'red').length
      return {
        id: s.id,
        name: s.name,
        color: s.color,
        total,
        green,
        yellow,
        red,
        mastery: total > 0 ? Math.round((green / total) * 100) : 0,
      }
    })
  }

  // Calculate travel study ratio
  const travelRatio = (() => {
    let totalSegments = 0
    let studiedSegments = 0
    for (const log of (travelLogs || [])) {
      const segments = log.segments_json || []
      const studied = log.studied_during_json || []
      totalSegments += segments.length
      studiedSegments += studied.filter((s: any) => s.studied).length
    }
    return totalSegments > 0 ? studiedSegments / totalSegments : 0
  })()

  return (
    <StatsClient
      checkins={checkins || []}
      plans={plans || []}
      workouts={workouts || []}
      subjectProgress={subjectProgress}
      travelRatio={travelRatio}
      today={today}
      userId={user.id}
    />
  )
}
