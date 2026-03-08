import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import OnboardingClient from './OnboardingClient'

export default async function OnboardingPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // If user already has config, skip onboarding
  const { data: config } = await supabase
    .from('user_config')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (config) redirect('/today')

  return <OnboardingClient />
}
