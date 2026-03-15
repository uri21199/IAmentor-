import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import SubjectsClient from './SubjectsClient'

export default async function SubjectsPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Use limit(1) instead of .single() to avoid silent failure on 0 or 2+ active semesters
  const { data: semesterRows } = await supabase
    .from('semesters')
    .select('id, name')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)

  const semester = semesterRows?.[0] ?? null

  if (!semester) {
    return (
      <div className="px-4 pt-6 max-w-lg mx-auto text-center py-20">
        <p className="text-4xl mb-4">📚</p>
        <h2 className="text-xl font-bold text-text-primary mb-2">Sin cuatrimestre activo</h2>
        <p className="text-text-secondary text-sm mb-2">
          Creá un cuatrimestre y marcalo como activo.
        </p>
        <p className="text-text-secondary text-xs mb-6">
          Una vez activo, volvé aquí para cargar tus materias y temas.
        </p>
        <Link
          href="/cuatrimestres"
          className="inline-block px-5 py-2.5 rounded-2xl bg-primary text-white text-sm font-medium"
        >
          Ir a Cuatrimestres →
        </Link>
      </div>
    )
  }

  // Get subjects with unit/topic counts (exclude soft-deleted)
  const { data: subjects } = await supabase
    .from('subjects')
    .select(`
      id, name, color,
      units (
        id,
        topics (id, status)
      )
    `)
    .eq('semester_id', semester.id)
    .is('deleted_at', null)
    .order('name')

  // Get upcoming academic events
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data: events } = await supabase
    .from('academic_events')
    .select('*')
    .eq('user_id', user.id)
    .gte('date', today)
    .order('date', { ascending: true })

  return (
    <div className="px-4 pt-4 pb-28 max-w-lg mx-auto">
      <SubjectsClient
        semesterId={semester.id}
        semesterName={semester.name}
        subjects={(subjects || []) as any}
        events={(events || []) as any}
        today={today}
        userId={user.id}
      />
    </div>
  )
}
