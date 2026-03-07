import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { replanDay } from '@/lib/anthropic'
import { format } from 'date-fns'

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { change } = await req.json()
    if (!change) {
      return NextResponse.json({ error: 'change is required' }, { status: 400 })
    }

    const today = format(new Date(), 'yyyy-MM-dd')

    // Get current plan
    const { data: plan } = await supabase
      .from('daily_plans')
      .select('plan_json')
      .eq('user_id', user.id)
      .eq('date', today)
      .single()

    if (!plan?.plan_json) {
      return NextResponse.json({ error: 'No plan found for today' }, { status: 400 })
    }

    // Get check-in for context
    const { data: checkin } = await supabase
      .from('checkins')
      .select('energy_level, stress_level')
      .eq('user_id', user.id)
      .eq('date', today)
      .single()

    const updatedBlocks = await replanDay(
      plan.plan_json,
      change,
      {
        energy_level: checkin?.energy_level || 3,
        stress_level: checkin?.stress_level || 'low',
      }
    )

    // Save updated plan
    await supabase
      .from('daily_plans')
      .update({ plan_json: updatedBlocks })
      .eq('user_id', user.id)
      .eq('date', today)

    return NextResponse.json({ blocks: updatedBlocks })
  } catch (err: any) {
    console.error('Replan error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
