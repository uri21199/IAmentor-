import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { format, subDays } from 'date-fns'
import StatsClient from './StatsClient'

export default async function StatsPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd')

  // Fetch workouts (last 30 days)
  const { data: workouts } = await supabase
    .from('workouts')
    .select('date, type, completed, duration_minutes')
    .eq('user_id', user.id)
    .gte('date', thirtyDaysAgo)
    .order('date', { ascending: true })

  // Fetch checkins for energy/completion correlation (last 30 days)
  const { data: checkins } = await supabase
    .from('checkins')
    .select('date, energy_level')
    .eq('user_id', user.id)
    .gte('date', thirtyDaysAgo)
    .order('date', { ascending: true })

  // Fetch daily plans for completion % correlation
  const { data: dailyPlans } = await supabase
    .from('daily_plans')
    .select('date, completion_percentage')
    .eq('user_id', user.id)
    .gte('date', thirtyDaysAgo)
    .order('date', { ascending: true })

  // Active semester subjects with topic status — exclude soft-deleted subjects
  const { data: semester } = await supabase
    .from('semesters')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  let subjectProgress: { id: string; name: string; color: string; total: number; green: number; yellow: number; red: number; mastery: number }[] = []
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
      .is('deleted_at', null)
      .order('name')

    subjectProgress = (subjects || []).map((s) => {
      const topics = (s.units as { topics: { status: string }[] }[])?.flatMap(u => u.topics) || []
      const total = topics.length
      const green = topics.filter(t => t.status === 'green').length
      const yellow = topics.filter(t => t.status === 'yellow').length
      const red = topics.filter(t => t.status === 'red').length
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

  // Build correlation data: join checkins + plans by date
  const plansByDate = new Map((dailyPlans || []).map(p => [p.date, p.completion_percentage ?? 0]))
  const correlationData = (checkins || []).map(c => ({
    date: c.date,
    energy: c.energy_level,
    completion: plansByDate.get(c.date) ?? null,
  })).filter(d => d.completion !== null)

  return (
    <StatsClient
      workouts={workouts || []}
      subjectProgress={subjectProgress}
      correlationData={correlationData as { date: string; energy: number; completion: number }[]}
    />
  )
}
