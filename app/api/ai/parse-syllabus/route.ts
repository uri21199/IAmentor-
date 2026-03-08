import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { anthropic } from '@/lib/anthropic'

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file      = formData.get('file') as File | null
    const subjectId = formData.get('subject_id') as string | null

    if (!file || !subjectId) {
      return NextResponse.json({ error: 'Missing file or subject_id' }, { status: 400 })
    }

    // Convert file to base64
    const bytes  = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const isPdf  = file.type === 'application/pdf'

    // Build Anthropic content block (image or document)
    const mediaBlock = isPdf
      ? {
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
        }
      : {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: base64,
          },
        }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            mediaBlock as any,
            {
              type: 'text',
              text: 'Extraé el temario/programa de la materia de este documento. Devolvé ÚNICAMENTE un JSON array sin markdown ni texto adicional: [{"unit":"Nombre Unidad","topics":["Tema 1","Tema 2"]}]. Solo el array JSON, nada más.',
            },
          ],
        },
      ],
    })

    const rawText = (message.content[0] as any).text as string

    // Extract JSON array (defensive: strip any leading/trailing text)
    const jsonMatch = rawText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse syllabus from AI response' }, { status: 422 })
    }

    const parsed: { unit: string; topics: string[] }[] = JSON.parse(jsonMatch[0])

    // Verify this subject belongs to the user
    const { data: subject } = await supabase
      .from('subjects')
      .select('id')
      .eq('id', subjectId)
      .eq('user_id', user.id)
      .single()

    if (!subject) {
      return NextResponse.json({ error: 'Subject not found or not owned by user' }, { status: 403 })
    }

    // Insert units + topics
    let totalTopics = 0
    for (let i = 0; i < parsed.length; i++) {
      const unitName = (parsed[i].unit || '').trim()
      if (!unitName) continue

      const { data: unit, error: unitErr } = await supabase
        .from('units')
        .insert({ subject_id: subjectId, name: unitName, order_index: i })
        .select()
        .single()

      if (unitErr || !unit) continue

      const topicRows = (parsed[i].topics || [])
        .map((name: string) => name.trim())
        .filter(Boolean)
        .map((name: string) => ({ unit_id: unit.id, name, full_description: '', status: 'red' }))

      if (topicRows.length > 0) {
        await supabase.from('topics').insert(topicRows)
        totalTopics += topicRows.length
      }
    }

    return NextResponse.json({ units: parsed.length, topics: totalTopics })
  } catch (err) {
    console.error('[parse-syllabus]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
