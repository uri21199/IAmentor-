import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import FabMenu from '@/components/features/FabMenu'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch subjects for the FabMenu (post-clase + event forms need subjects)
  const { data: subjects } = await supabase
    .from('subjects')
    .select('id, name, color, units(id, name, order_index, topics(id, name, status))')
    .eq('user_id', user.id)
    .order('name')

  const subjectsData = (subjects || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    units: (s.units || [])
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((u: any) => ({ id: u.id, name: u.name, topics: u.topics || [] })),
  }))

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <AppShell userEmail={user.email}>
        {children}
      </AppShell>

      {/* Global FAB — visible on all app pages */}
      <FabMenu subjectsData={subjectsData} userId={user.id} />
    </div>
  )
}
