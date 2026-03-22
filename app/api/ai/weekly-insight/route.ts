import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { generateWeeklyInsight } from '@/lib/anthropic'

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimitResponse = await checkRateLimit('weekly-insight', user.id)
    if (rateLimitResponse) return rateLimitResponse

    const body = await req.json()

    const insight = await generateWeeklyInsight({
      avg_energy: body.avg_energy || 3,
      avg_completion: body.avg_completion || 0,
      total_workouts: body.total_workouts || 0,
      travel_studied_ratio: body.travel_ratio || 0,
      energy_by_day: body.energy_by_day || {},
      top_subjects: body.top_subjects || [],
    })

    return NextResponse.json({ insight })
  } catch (err: any) {
    console.error('Weekly insight error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
