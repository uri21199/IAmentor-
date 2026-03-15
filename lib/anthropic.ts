import Anthropic from '@anthropic-ai/sdk'
import type {
  PlanGenerationContext,
  TimeBlock,
  MicroReview,
} from '@/types'
import { getCurrentTimeArg, getTodayArg } from '@/lib/utils'

// .trim() is defensive: if the key was pasted with a trailing newline in Vercel
// env vars, the Anthropic SDK throws "not a legal HTTP header value"
export const anthropic = new Anthropic({
  apiKey: (process.env.ANTHROPIC_API_KEY ?? '').trim(),
})

// ── Internal: build the planning prompt ──────────────────────────────────────

function buildPlanPrompt(
  context: PlanGenerationContext,
  outputFormat: 'array' | 'ndjson',
  travelBlockIds?: string[],
): string {
  const { checkin, calendar_events, study_priorities, energy_history, fixed_blocks } = context
  const currentTime = getCurrentTimeArg()

  const travelSegments = checkin.travel_route_json
    .map((s, i) => `  Tramo ${i + 1}: ${s.origin} → ${s.destination} (${s.duration_minutes} min)`)
    .join('\n')

  const academicPriorities = study_priorities
    .map(sp => {
      const mode = sp.study_mode === 'exam_prep' ? '🔴 MODO EXAMEN' :
                   sp.study_mode === 'active_review' ? '🟠 REVISIÓN ACTIVA' :
                   sp.study_mode === 'light' ? '🟡 LIVIANO' : '🟢 NORMAL'
      const weakTopics = sp.weak_topics.slice(0, 3).map(t => t.name).join(', ')
      return `  - ${sp.subject_name}: ${mode} (score ${sp.priority_score}) | Temas débiles: ${weakTopics || 'ninguno'}`
    })
    .join('\n')

  const calendarStr = calendar_events
    .map(e => `  - ${e.summary}: ${e.start} → ${e.end}`)
    .join('\n') || '  (ninguno)'

  const energyTrend = energy_history
    .slice(-7)
    .map(h => `${h.date}: ${h.energy_level}/5`)
    .join(', ')

  const fixedBlocksStr = fixed_blocks.length > 0
    ? fixed_blocks
        .map(b => {
          const tag = b.manually_edited ? ' ⚠️ EDITADO MANUALMENTE — NO modificar' : ''
          return `  - ${b.start_time}–${b.end_time}: ${b.title} (tipo: ${b.type})${tag}`
        })
        .join('\n')
    : '  (ninguno)'

  const microReviewSection = travelBlockIds && travelBlockIds.length > 0
    ? `
## MICRO-REPASOS PARA BLOQUES DE VIAJE
Para cada bloque de viaje, generá una línea JSON con micro_review (ANTES de los bloques adicionales):
{ "type": "travel_micro_review", "travel_block_id": "ID_DEL_BLOQUE", "micro_review": { "topic": "Nombre del tema", "pills": ["concepto 1", "concepto 2", "concepto 3"], "self_test": "Pregunta de autoevaluación" } }

Bloques de viaje activos:
${travelBlockIds.map((id, i) => {
  const seg = checkin.travel_route_json[i]
  return `  - ID: ${id}, Tramo: ${seg?.origin} → ${seg?.destination} (${seg?.duration_minutes} min)`
}).join('\n')}

Reglas para micro_review:
- Elegí el tema con mayor priority_score o el más débil del usuario
- pills: exactamente 3 conceptos ultra-concisos (máx 10 palabras cada uno)
- self_test: 1 pregunta de autoevaluación corta
`
    : ''

  const formatInstruction = outputFormat === 'ndjson'
    ? `Respondé con UN OBJETO JSON POR LÍNEA (formato NDJSON). Primero los micro_reviews de viaje, luego los bloques adicionales. Un objeto por línea, sin arrays, sin markdown, sin explicaciones.`
    : `Respondé ÚNICAMENTE con un JSON array de los bloques ADICIONALES. Cada bloque debe seguir el formato indicado. Sin markdown, sin explicaciones adicionales.`

  return `Eres un mentor de productividad personal. Generá los bloques de tiempo ADICIONALES para hoy.

## HORA ACTUAL: ${currentTime}

## CONTEXTO CULTURAL — ARGENTINA (GMT-3)
Adaptá los horarios a la cultura argentina:
- Almuerzo: entre 12:30 y 14:00 (incluilo SIEMPRE que haya hueco disponible)
- Merienda: 16:30–17:30 (descanso corto, opcional)
- Cena: entre 21:00 y 22:30 (incluila si el día llega hasta esa hora)
IMPORTANTE: NO uses horarios de EE.UU. (cena 18–19hs, almuerzo antes de las 12hs).

## BLOQUES FIJOS (ya están agendados — NO los incluyas en tu respuesta de bloques adicionales)
${fixedBlocksStr}
IMPORTANTE: NO generes bloques que se superpongan con los bloques fijos. Solo generá bloques para los huecos disponibles.
Los bloques marcados con ⚠️ EDITADO MANUALMENTE fueron modificados por el usuario y NO deben reemplazarse ni modificarse bajo ninguna circunstancia.
${microReviewSection}
## DATOS DEL CHECK-IN
- Calidad de sueño: ${checkin.sleep_quality}/5
- Nivel de energía: ${checkin.energy_level}/5
- Estrés: ${checkin.stress_level === 'low' ? 'Tranquilo' : checkin.stress_level === 'medium' ? 'Algo estresado' : 'Muy estresado'}
- Modalidad de trabajo: ${checkin.work_mode}
- Tiene facultad hoy: ${checkin.has_faculty ? `Sí (${checkin.faculty_mode} - ${checkin.faculty_subject})` : 'No'}
- Imprevistos: ${checkin.unexpected_events || 'ninguno'}

## RUTA DE VIAJE DEL DÍA
${travelSegments || '  (sin viajes)'}

## EVENTOS DE GOOGLE CALENDAR
${calendarStr}

## PRIORIDADES DE ESTUDIO (ordenadas por urgencia)
${academicPriorities || '  (sin materias cargadas)'}

## HISTORIAL DE ENERGÍA (últimos 7 días)
${energyTrend}

## REGLAS IMPORTANTES
1. Insertá bloques de VIAJE en los tramos indicados
2. En bloques de viaje: SOLO estudio teórico. NUNCA ejercicios prácticos
3. Sugerí qué tema teórico estudiar en cada tramo según urgencia académica
4. Adaptá la intensidad según energía: ${checkin.energy_level}/5
5. Si energía ≤ 2: sesiones de máx 25 min con descansos frecuentes
6. Empezá los bloques desde las ${currentTime} (hora actual), el horario llega hasta las 23:00
7. Incluí al menos 2 bloques de descanso
8. NO repitas los bloques fijos ya indicados arriba
9. BLOQUES DE TRABAJO: el bloque de trabajo debe ser UN ÚNICO BLOQUE continuo que cubre el horario completo de trabajo. NO incluyas pausas ni descansos dentro del horario laboral. La ÚNICA excepción es si hay un bloque de VIAJE que cae dentro del horario de trabajo — en ese caso dividí el trabajo en dos bloques (antes y después del viaje).

## FORMATO DE CADA BLOQUE ADICIONAL
{
  "id": "block_1",
  "start_time": "HH:MM",
  "end_time": "HH:MM",
  "type": "work|class|study|travel|gym|rest|free",
  "title": "título del bloque",
  "description": "descripción breve con qué hacer específicamente",
  "completed": false,
  "priority": "low|medium|high|exam"
}

${formatInstruction}`
}

// ── Generate daily plan (non-streaming, legacy) ───────────────────────────────

export async function generateDailyPlan(
  context: PlanGenerationContext
): Promise<TimeBlock[]> {
  const prompt = buildPlanPrompt(context, 'array')

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  try {
    const blocks: TimeBlock[] = JSON.parse(content.text)
    return blocks
  } catch {
    const jsonMatch = content.text.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    throw new Error('Failed to parse plan from AI response')
  }
}

// ── Generate daily plan (streaming / NDJSON) ──────────────────────────────────

/** Internal shape for micro_review events emitted by Claude */
interface TravelMicroReviewEvent {
  type: 'travel_micro_review'
  travel_block_id: string
  micro_review: MicroReview
}

/**
 * Streams plan blocks as an async generator.
 * Yields TimeBlock objects for regular blocks.
 * Yields TravelMicroReviewEvent objects for travel micro-reviews.
 *
 * @param context - Plan generation context
 * @param travelBlockIds - IDs of deterministic travel blocks that need micro_reviews
 */
export async function* generateDailyPlanStream(
  context: PlanGenerationContext,
  travelBlockIds: string[] = [],
): AsyncGenerator<TimeBlock | TravelMicroReviewEvent> {
  const prompt = buildPlanPrompt(context, 'ndjson', travelBlockIds)

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-5',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  let buffer = ''

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      buffer += event.delta.text

      // Split on newlines: each complete line may be a JSON object
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? '' // Keep incomplete last line in buffer

      for (const line of lines) {
        const parsed = tryParseJsonLine(line)
        if (parsed) yield parsed
      }
    }
  }

  // Process any remaining content in the buffer
  if (buffer.trim()) {
    // Could be a trailing complete object or a JSON array fallback
    const trimmed = buffer.trim()
    if (trimmed.startsWith('[')) {
      try {
        const arr = JSON.parse(trimmed)
        for (const item of arr) if (item && typeof item === 'object') yield item
      } catch { /* ignore */ }
    } else {
      const parsed = tryParseJsonLine(trimmed)
      if (parsed) yield parsed
    }
  }
}

/** Parse a single line as JSON, removing surrounding array syntax and trailing commas */
function tryParseJsonLine(line: string): TimeBlock | TravelMicroReviewEvent | null {
  const trimmed = line.trim().replace(/^,|,$/, '').trim()
  if (!trimmed || trimmed === '[' || trimmed === ']') return null
  if (!trimmed.startsWith('{')) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

// ── Replan ────────────────────────────────────────────────────────────────────

export async function replanDay(
  currentPlan: TimeBlock[],
  change: string,
  context: { energy_level: number; stress_level: string; unexpected_events?: string | null }
): Promise<TimeBlock[]> {
  // Argentina timezone: Vercel runs UTC, Argentina = UTC-3
  const now = getCurrentTimeArg()
  const [y, m, d] = getTodayArg().split('-')
  const todayDisplay = `${d}/${m}/${y}`

  const unexpectedContext = context.unexpected_events
    ? `- Imprevistos del día (registrados al inicio): ${context.unexpected_events}`
    : ''

  const lockedBlocks = currentPlan
    .filter(b => b.manually_edited && !b.deleted)
    .map(b => `  - ${b.start_time}–${b.end_time}: ${b.title}`)
    .join('\n') || '  (ninguno)'

  const prompt = `Eres un mentor de productividad. El usuario necesita reorganizar su plan del día.

## PLAN ACTUAL (${todayDisplay})
${JSON.stringify(currentPlan, null, 2)}

## HORA ACTUAL: ${now}

## ⚠️ CAMBIO REPORTADO AHORA (PRIORIDAD MÁXIMA — adaptá el plan a esto)
${change}

## CONTEXTO DEL DÍA
- Energía: ${context.energy_level}/5
- Estrés: ${context.stress_level}
${unexpectedContext}

## BLOQUES EDITADOS MANUALMENTE (NO modificar bajo ninguna circunstancia)
Los siguientes bloques fueron editados manualmente por el usuario y NO deben modificarse ni reemplazarse:
${lockedBlocks}

## INSTRUCCIONES
1. Mantené los bloques ya completados (completed: true) sin cambios
2. Mantené los bloques con manually_edited: true EXACTAMENTE como están (título, descripción, horario)
3. Solo reorganizá los bloques pendientes a partir de ${now}
4. El "CAMBIO REPORTADO" es lo más importante: ajustá el plan para accommodarlo, incluso si implica reducir la intensidad o eliminar bloques
5. Si el cambio indica cansancio/estrés/imprevistos, reducí la intensidad de los bloques restantes
6. Respetá los imprevistos del día ya registrados al inicio (si los hay) al generar los bloques
7. Respondé ÚNICAMENTE con el JSON array completo (incluyendo bloques ya completados, editados manualmente, y eliminados — todos deben aparecer)
8. No uses markdown ni explicaciones`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  try {
    return JSON.parse(content.text)
  } catch {
    const jsonMatch = content.text.match(/\[[\s\S]*\]/)
    if (jsonMatch) return JSON.parse(jsonMatch[0])
    throw new Error('Failed to parse replan from AI response')
  }
}

// ── Weekly insight ─────────────────────────────────────────────────────────────

export async function generateWeeklyInsight(data: {
  avg_energy: number
  avg_completion: number
  total_workouts: number
  travel_studied_ratio: number
  energy_by_day: Record<string, number>
  top_subjects: string[]
}): Promise<string> {
  const prompt = `Eres un mentor de productividad. Generá un resumen semanal conciso (máx 3 oraciones) en español.

Datos:
- Energía promedio: ${data.avg_energy}/5
- Plan completado promedio: ${data.avg_completion}%
- Entrenamientos completados: ${data.total_workouts}/5
- Viajes aprovechados para estudiar: ${Math.round(data.travel_studied_ratio * 100)}%
- Energía por día: ${JSON.stringify(data.energy_by_day)}
- Materias trabajadas: ${data.top_subjects.join(', ')}

Identificá 1 patrón positivo, 1 área de mejora, y 1 recomendación concreta para la próxima semana.
Respondé directamente con el texto, sin JSON, sin markdown.`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') return 'No se pudo generar el insight semanal.'
  return content.text
}
