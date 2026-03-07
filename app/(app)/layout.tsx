import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import BottomNav from '@/components/layout/BottomNav'
import ReplanButton from '@/components/features/ReplanButton'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Main content with bottom padding for nav */}
      <main className="flex-1 pb-24">
        {children}
      </main>

      {/* Floating replan button */}
      <ReplanButton />

      {/* Bottom navigation (includes Settings ⚙️) */}
      <BottomNav />
    </div>
  )
}
