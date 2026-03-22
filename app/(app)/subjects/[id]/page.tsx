import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect, notFound } from 'next/navigation'
import SubjectDetailClient from './SubjectDetailClient'
import type { SubjectWithDetails, AcademicEvent, Grade } from '@/types'
import { getTodayArg } from '@/lib/utils'

export default async function SubjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
    .eq('id', id)
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
  // Use Argentina timezone — Vercel runs UTC, Argentina = UTC-3
  const today = getTodayArg()
  const { data: events } = await supabase
    .from('academic_events')
    .select('*')
    .eq('subject_id', id)
    .eq('user_id', user.id)
    .order('date', { ascending: true })

  // Fetch recent class logs
  const { data: classLogs } = await supabase
    .from('class_logs')
    .select('*')
    .eq('subject_id', id)
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(5)

  // Fetch grades for this subject (to show scores on event cards)
  const { data: grades } = await supabase
    .from('grades')
    .select('id, event_id, score, max_score')
    .eq('subject_id', id)
    .eq('user_id', user.id)

  return (
    <SubjectDetailClient
      subject={sortedSubject as SubjectWithDetails}
      events={(events || []) as AcademicEvent[]}
      classLogs={classLogs || []}
      grades={(grades || []) as Pick<Grade, 'id' | 'event_id' | 'score' | 'max_score'>[]}
      today={today}
      userId={user.id}
    />
  )
}
