import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { anthropic } from '@/lib/anthropic'

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rateLimitResponse = await checkRateLimit('parse-syllabus', user.id)
    if (rateLimitResponse) return rateLimitResponse

    const formData = await req.formData()
    const file      = formData.get('file') as File | null
    const subjectId = formData.get('subject_id') as string | null

    if (!file || !subjectId) {
      return NextResponse.json({ error: 'Missing file or subject_id' }, { status: 400 })
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10 MB.' }, { status: 413 })
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
              text: `Extraé el temario/programa de la materia de este documento.

REGLAS IMPORTANTES:
1. Las UNIDADES son las secciones principales (Unidad 1, Unidad 2, Capítulo 1, Módulo A, etc.)
2. Los TEMAS son los puntos individuales DENTRO de cada unidad (subtemas, ítems de lista)
3. NUNCA pongas todos los temas en una sola unidad — identificá las secciones reales
4. Si el documento no tiene secciones claras, inferí la estructura jerárquica del contenido
5. Cada unidad debería tener entre 2 y 15 temas como máximo

Devolvé ÚNICAMENTE un JSON array sin markdown ni texto adicional:
[{"unit":"Nombre de la Unidad","topics":["Tema específico 1","Tema específico 2"]}]

Solo el array JSON, absolutamente nada más antes ni después.`,
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
