import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { anthropic } from '@/lib/anthropic'

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rateLimitResponse = await checkRateLimit('parse-events', user.id)
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

    // Convert file to base64
    const bytes  = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const isPdf  = file.type === 'application/pdf'

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

    const currentYear = new Date().getFullYear()

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            mediaBlock as any,
            {
              type: 'text',
              text: `Extraé todas las fechas importantes académicas de este documento (parciales, trabajos prácticos, entregas, recuperatorios, etc.).

El año actual es ${currentYear}. Si el documento no especifica el año, usá ${currentYear}.

TIPOS VÁLIDOS (usá exactamente uno de estos valores):
- "parcial" → para parciales principales y recuperatorios
- "parcial_intermedio" → para parcialitos, evaluaciones intermedias, instancias parciales
- "entrega_tp" → para entregas de TP, trabajos prácticos, laboratorios, TPs demostrativos

REGLAS:
1. Convertí todas las fechas al formato YYYY-MM-DD
2. Para fechas con mes en texto (ej: "17-03", "31 Oct", "3-Nov"), inferí el año según el contexto
3. Si una fecha es ambigua (ej: "a definir"), omitila
4. El título debe ser descriptivo (ej: "Parcialito Cinemática", "TP N°1 Mediciones", "1er Recuperatorio")
5. En notes podés incluir horario o aula si aparece (ej: "19hs", "Vi 21/11")

Devolvé ÚNICAMENTE un JSON array sin markdown ni texto adicional:
[{"type":"parcial","title":"Título del evento","date":"YYYY-MM-DD","notes":"info adicional o null"}]

Solo el array JSON, absolutamente nada más.`,
            },
          ],
        },
      ],
    })

    const rawText = (message.content[0] as any).text as string

    const jsonMatch = rawText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse events from AI response' }, { status: 422 })
    }

    const parsed: { type: string; title: string; date: string; notes?: string | null }[] = JSON.parse(jsonMatch[0])

    const validTypes = new Set(['parcial', 'parcial_intermedio', 'entrega_tp', 'medico', 'personal'])

    const rows = parsed
      .filter(e => e.title && e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && validTypes.has(e.type))
      .map(e => ({
        subject_id: subjectId,
        user_id: user.id,
        type: e.type,
        title: e.title.trim(),
        date: e.date,
        notes: e.notes || null,
      }))

    if (rows.length === 0) {
      return NextResponse.json({ events: [] })
    }

    const { data: inserted, error } = await supabase
      .from('academic_events')
      .insert(rows)
      .select()

    if (error) {
      console.error('[parse-events] insert error', error)
      return NextResponse.json({ error: 'Failed to save events' }, { status: 500 })
    }

    return NextResponse.json({ events: inserted ?? [], count: (inserted ?? []).length })
  } catch (err) {
    console.error('[parse-events]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
