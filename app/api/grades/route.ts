import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * GET /api/grades?subject_id=xxx
 * Returns all grades for the authenticated user's subject.
 *
 * POST /api/grades
 * Body: { subject_id, event_id?, title, grade_type, score?, max_score?, notes?, exam_date? }
 * Creates a new grade record.
 */

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const subjectId = searchParams.get('subject_id')
    if (!subjectId) return NextResponse.json({ error: 'subject_id required' }, { status: 400 })

    const { data, error } = await supabase
      .from('grades')
      .select('*')
      .eq('user_id', user.id)
      .eq('subject_id', subjectId)
      .order('exam_date', { ascending: false })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('GET /api/grades error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { subject_id, event_id, title, grade_type, score, max_score, notes, exam_date } = body

    if (!subject_id || !title || !grade_type) {
      return NextResponse.json({ error: 'subject_id, title and grade_type are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('grades')
      .insert({
        user_id:    user.id,
        subject_id,
        event_id:   event_id ?? null,
        title,
        grade_type,
        score:      score ?? null,
        max_score:  max_score ?? 10,
        notes:      notes ?? null,
        exam_date:  exam_date ?? null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('POST /api/grades error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
