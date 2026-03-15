import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** Detection window: 2 hours in milliseconds */
const DETECTION_WINDOW_MS = 2 * 60 * 60 * 1000
/** Number of completions in the window that triggers a challenge */
const DETECTION_THRESHOLD = 3

/**
 * POST /api/topics/complete
 *
 * Records a topic being marked as "green" (mastered) and checks whether
 * the user is progressing suspiciously fast (hallucination of progress).
 *
 * Body: { topic_id: string, subject_id: string, topic_name: string }
 *
 * Returns:
 *   { needs_validation: false }
 *   { needs_validation: true, challenge: HallucinationChallenge }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { topic_id, subject_id, topic_name } = await req.json()
    if (!topic_id || !subject_id || !topic_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Record this completion
    const { data: completion, error: insertErr } = await supabase
      .from('topic_completions')
      .insert({
        user_id: user.id,
        topic_id,
        subject_id,
        topic_name,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertErr) throw insertErr

    // Count unchallenged completions in the last 2-hour window
    const windowStart = new Date(Date.now() - DETECTION_WINDOW_MS).toISOString()
    const { count } = await supabase
      .from('topic_completions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('completed_at', windowStart)
      .is('challenge_result', null)

    // Below threshold → no validation needed
    if ((count ?? 0) <= DETECTION_THRESHOLD) {
      return NextResponse.json({ needs_validation: false })
    }

    // ── Threshold exceeded: generate a micro-validation challenge ─────────────
    // Fetch the topic's full_description for richer question generation
    const { data: topicData } = await supabase
      .from('topics')
      .select('name, full_description')
      .eq('id', topic_id)
      .single()

    const descriptionContext = topicData?.full_description
      ? `\nDescripción del tema: "${topicData.full_description}"`
      : ''

    const prompt = `Eres un tutor universitario. Generá una pregunta de opción múltiple breve para verificar que un estudiante entendió el tema "${topicData?.name ?? topic_name}".${descriptionContext}

Devolvé SOLO JSON válido con este formato exacto:
{
  "question": "¿Cuál es...? (pregunta concisa en español)",
  "options": ["opción A correcta", "distractor B", "distractor C", "distractor D"],
  "correct_index": 0
}

Reglas:
- La pregunta y opciones deben estar en español
- Una opción claramente correcta (siempre en el índice que indiques en correct_index)
- Tres distractores plausibles pero incorrectos
- Mantené la pregunta corta y enfocada en el concepto central`

    let challengeData: { question: string; options: string[]; correct_index: number }

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 350,
        messages: [{ role: 'user', content: prompt }],
      })
      const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON block found in AI response')
      challengeData = JSON.parse(jsonMatch[0])
    } catch {
      // Fallback: self-assessment challenge that works for any topic
      challengeData = {
        question: `¿Podés explicar con tus propias palabras qué es "${topic_name}"?`,
        options: [
          'Sí, lo entiendo bien y podría explicárselo a alguien',
          'Lo entiendo a grandes rasgos, con algunos puntos dudosos',
          'Me queda poco claro, necesito repasar',
          'Apenas lo vi por encima, no lo domino aún',
        ],
        correct_index: 0,
      }
    }

    // Persist challenge data on the completion record (correct_index stays server-side)
    await supabase
      .from('topic_completions')
      .update({
        challenge_question: challengeData.question,
        challenge_options: challengeData.options,
        challenge_correct_index: challengeData.correct_index,
      })
      .eq('id', completion.id)

    // Return challenge WITHOUT correct_index — validated server-side in /api/topics/validate
    return NextResponse.json({
      needs_validation: true,
      challenge: {
        completion_id: completion.id,
        topic_id,
        topic_name,
        question: challengeData.question,
        options: challengeData.options,
      },
    })
  } catch (err: any) {
    console.error('[api/topics/complete]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
