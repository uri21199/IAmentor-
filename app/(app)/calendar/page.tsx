import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { getTodayArg } from '@/lib/utils'
import CalendarClient from './CalendarClient'

export default async function CalendarPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = getTodayArg()
  // Fetch events for the next 6 months
  const in6Months = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: events } = await supabase
    .from('academic_events')
    .select('id, title, date, type, notes, subjects(name, color)')
    .eq('user_id', user.id)
    .lte('date', in6Months)
    .order('date', { ascending: true })

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto">
      <CalendarClient events={events || []} today={today} />
    </div>
  )
}
