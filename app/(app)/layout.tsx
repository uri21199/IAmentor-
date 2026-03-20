import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import FabMenu from '@/components/features/FabMenu'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch active semester to scope subjects
  const { data: semesterRows } = await supabase
    .from('semesters')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)

  const activeSemesterId = semesterRows?.[0]?.id ?? null

  // Fetch subjects for the FabMenu — only active semester, exclude soft-deleted
  const { data: subjects } = activeSemesterId
    ? await supabase
        .from('subjects')
        .select('id, name, color, units(id, name, order_index, topics(id, name, status))')
        .eq('semester_id', activeSemesterId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('name')
    : { data: null }

  const subjectsData = (subjects || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    units: (s.units || [])
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((u: any) => ({ id: u.id, name: u.name, topics: u.topics || [] })),
  }))

  return (
    <div className="bg-background">
      <AppShell userEmail={user.email}>
        {children}
      </AppShell>

      {/* Global FAB — visible on all app pages */}
      <FabMenu subjectsData={subjectsData} userId={user.id} />
    </div>
  )
}
