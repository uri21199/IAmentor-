import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import GradesClient from './GradesClient'
import { getTodayArg } from '@/lib/utils'
import type { Grade, AcademicEvent, Subject } from '@/types'

export default async function GradesPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = getTodayArg()

  const [{ data: grades }, { data: subjects }, { data: events }] = await Promise.all([
    supabase
      .from('grades')
      .select('*')
      .eq('user_id', user.id)
      .order('exam_date', { ascending: false }),
    // Inner join with semesters — only subjects from an active semester
    supabase
      .from('subjects')
      .select('id, name, color, semester_id, created_at, semesters!inner(is_active)')
      .eq('user_id', user.id)
      .eq('semesters.is_active', true)
      .order('name', { ascending: true }),
    supabase
      .from('academic_events')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false }),
  ])

  return (
    <GradesClient
      grades={(grades || []) as Grade[]}
      subjects={(subjects || []) as Subject[]}
      events={(events || []) as AcademicEvent[]}
      today={today}
      userId={user.id}
    />
  )
}
