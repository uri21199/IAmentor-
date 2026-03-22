import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * POST /api/topics/validate
 *
 * Validates a user's answer to a hallucination-detection challenge.
 * Looks up the correct_index server-side and compares with the user's selection.
 *
 * Body: {
 *   completion_id: string,   — ID of the topic_completions row
 *   topic_id: string,        — to update status if failed
 *   selected_index: number,  — which option the user picked (0-3)
 *   skipped?: boolean        — user chose to skip validation
 * }
 *
 * Returns: { passed: boolean, new_status: 'green' | 'yellow' }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { completion_id, topic_id, selected_index, skipped } = await req.json()

    // Handle skip: mark as skipped, keep topic green (benefit of the doubt)
    if (skipped) {
      await supabase
        .from('topic_completions')
        .update({ challenge_result: 'skipped' })
        .eq('id', completion_id)
        .eq('user_id', user.id)
      return NextResponse.json({ passed: true, new_status: 'green' })
    }

    // Fetch the completion record to get the correct_index (never sent to client)
    const { data: completion, error: fetchErr } = await supabase
      .from('topic_completions')
      .select('challenge_correct_index, challenge_options')
      .eq('id', completion_id)
      .eq('user_id', user.id)
      .single()

    if (fetchErr || !completion) {
      return NextResponse.json({ error: 'Completion not found' }, { status: 404 })
    }

    const correctIndex = completion.challenge_correct_index
    const options = completion.challenge_options as string[] | null

    // Determine pass/fail:
    // - For AI-generated MCQ: exact match required
    // - For self-assessment fallback (4-option scale): first two options pass
    let passed: boolean
    if (correctIndex === 0 && options && options[0]?.includes('entiendo')) {
      // Self-assessment mode: options 0 or 1 = passing
      passed = selected_index <= 1
    } else {
      passed = selected_index === correctIndex
    }

    const result = passed ? 'passed' : 'failed'
    const newStatus = passed ? 'green' : 'yellow'

    // Update the completion record with the result
    await supabase
      .from('topic_completions')
      .update({ challenge_result: result })
      .eq('id', completion_id)
      .eq('user_id', user.id)

    // If failed, revert topic to 'yellow' and clear next_review (needs re-study)
    if (!passed) {
      await supabase
        .from('topics')
        .update({ status: 'yellow', last_studied: new Date().toISOString(), next_review: null })
        .eq('id', topic_id)
    }

    return NextResponse.json({ passed, new_status: newStatus })
  } catch (err: any) {
    console.error('[api/topics/validate]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
