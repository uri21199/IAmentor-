import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import TodayClient from './TodayClient'
import type { CheckIn, DailyPlan, AcademicEvent, SubjectWithDetails } from '@/types'

export default async function TodayPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = format(new Date(), 'yyyy-MM-dd')

  // Fetch today's check-in
  const { data: checkin } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  // Fetch today's plan
  const { data: plan } = await supabase
    .from('daily_plans')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  // Fetch upcoming academic events (next 30 days)
  const { data: events } = await supabase
    .from('academic_events')
    .select('*, subjects(name, color)')
    .eq('user_id', user.id)
    .gte('date', today)
    .lte('date', format(
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'
    ))
    .order('date', { ascending: true })
    .limit(5)

  // Fetch energy history (last 7 days)
  const { data: energyHistory } = await supabase
    .from('checkins')
    .select('date, energy_level')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(7)

  return (
    <TodayClient
      user={user}
      checkin={checkin as CheckIn | null}
      plan={plan as DailyPlan | null}
      upcomingEvents={(events || []) as any[]}
      energyHistory={energyHistory || []}
      today={today}
    />
  )
}
