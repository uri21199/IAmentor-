import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect, notFound } from 'next/navigation'
import SubjectDetailClient from './SubjectDetailClient'
import type { SubjectWithDetails, AcademicEvent } from '@/types'
import { format } from 'date-fns'

export default async function SubjectDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch subject with full hierarchy
  const { data: subject } = await supabase
    .from('subjects')
    .select(`
      id, name, color, semester_id,
      units (
        id, name, order_index,
        topics (
          id, name, full_description, status, last_studied, next_review, created_at
        )
      )
    `)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()

  if (!subject) notFound()

  // Sort units by order_index
  const sortedSubject = {
    ...subject,
    units: (subject.units || [])
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((u: any) => ({
        ...u,
        topics: u.topics || [],
      })),
  }

  // Fetch academic events for this subject
  const today = format(new Date(), 'yyyy-MM-dd')
  const { data: events } = await supabase
    .from('academic_events')
    .select('*')
    .eq('subject_id', params.id)
    .order('date', { ascending: true })

  // Fetch recent class logs
  const { data: classLogs } = await supabase
    .from('class_logs')
    .select('*')
    .eq('subject_id', params.id)
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(5)

  return (
    <SubjectDetailClient
      subject={sortedSubject as SubjectWithDetails}
      events={(events || []) as AcademicEvent[]}
      classLogs={classLogs || []}
      today={today}
      userId={user.id}
    />
  )
}
