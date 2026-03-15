import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { format, addDays } from 'date-fns'
import GymClient from './GymClient'
import { determineStudyMode, type StudyMode } from '@/lib/study-priority'

export default async function GymPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = format(new Date(), 'yyyy-MM-dd')

  // Get today's check-in for energy level
  const { data: checkin } = await supabase
    .from('checkins')
    .select('energy_level')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  // Get last 12 workouts for week number calculation
  const { data: recentWorkouts } = await supabase
    .from('workouts')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(30)

  // Today's workout (if already logged)
  const { data: todayWorkout } = await supabase
    .from('workouts')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  // Weekly consistency (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return format(d, 'yyyy-MM-dd')
  })

  const workoutDays = new Set((recentWorkouts || []).map(w => w.date))

  // ── Feature 6: Determine study_mode from upcoming academic events ──────────
  // Fetch events in the next 14 days to detect exam / review windows
  const in14Days = format(addDays(new Date(), 14), 'yyyy-MM-dd')
  const { data: upcomingEvents } = await supabase
    .from('academic_events')
    .select('type, date')
    .eq('user_id', user.id)
    .gte('date', today)
    .lte('date', in14Days)
    .order('date', { ascending: true })

  // Use the same determineStudyMode logic as study-priority.ts
  let studyMode: StudyMode | null = null
  if (upcomingEvents && upcomingEvents.length > 0) {
    const now = new Date()
    let minDays = Infinity
    for (const ev of upcomingEvents) {
      const evDate = new Date(ev.date + 'T00:00:00')
      const days = Math.ceil((evDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (days < minDays) minDays = days
    }
    studyMode = determineStudyMode(minDays)
  }

  return (
    <GymClient
      energyLevel={checkin?.energy_level || 3}
      recentWorkouts={recentWorkouts || []}
      todayWorkout={todayWorkout || null}
      last7Days={last7Days}
      workoutDays={workoutDays}
      today={today}
      userId={user.id}
      studyMode={studyMode}
    />
  )
}
