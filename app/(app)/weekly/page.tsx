import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import WeeklyClient from './WeeklyClient'

export default async function WeeklyPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto md:max-w-2xl md:px-6">
      <WeeklyClient />
    </div>
  )
}
