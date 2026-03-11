import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { getTodayArg } from '@/lib/utils'
import AgendaClient from './AgendaClient'

export default async function AgendaPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = getTodayArg()
  const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: events } = await supabase
    .from('academic_events')
    .select('*, subjects(name, color)')
    .eq('user_id', user.id)
    .gte('date', today)
    .lte('date', in90Days)
    .order('date', { ascending: true })

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto">
      <AgendaClient events={events || []} today={today} />
    </div>
  )
}
