import Anthropic from '@anthropic-ai/sdk'
import type {
  PlanGenerationContext,
  TimeBlock,
  StudyPriorityResult,
  TravelSegment,
} from '@/types'
import { getCurrentTimeArg, getTodayArg } from '@/lib/utils'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// ── Generate daily plan ───────────────────────────────────────────────────────

export async function generateDailyPlan(
  context: PlanGenerationContext
): Promise<TimeBlock[]> {
  const { checkin, calendar_events, subjects_with_topics, study_priorities, energy_history, fixed_blocks } = context

  // Argentina timezone: Vercel runs UTC, Argentina = UTC-3
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
        .map(b => `  - ${b.start_time}–${b.end_time}: ${b.title} (tipo: ${b.type})`)
        .join('\n')
    : '  (ninguno)'

  const prompt = `Eres un mentor de productividad personal. Generá los bloques de tiempo ADICIONALES para hoy.

## HORA ACTUAL: ${currentTime}

## CONTEXTO CULTURAL — ARGENTINA (GMT-3)
Adaptá los horarios a la cultura argentina:
- Almuerzo: entre 12:30 y 14:00 (incluilo SIEMPRE que haya hueco disponible)
- Merienda: 16:30–17:30 (descanso corto, opcional)
- Cena: entre 21:00 y 22:30 (incluila si el día llega hasta esa hora)
IMPORTANTE: NO uses horarios de EE.UU. (cena 18–19hs, almuerzo antes de las 12hs).

## BLOQUES FIJOS (ya están agendados — NO los incluyas en tu respuesta)
${fixedBlocksStr}
IMPORTANTE: NO generes bloques que se superpongan con los bloques fijos. Solo generá bloques para los huecos disponibles.

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

## FORMATO DE RESPUESTA
Respondé ÚNICAMENTE con un JSON array de los bloques ADICIONALES. Cada bloque:
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

Generá el JSON array directamente, sin markdown, sin explicaciones adicionales.`

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

// ── Replan ────────────────────────────────────────────────────────────────────

export async function replanDay(
  currentPlan: TimeBlock[],
  change: string,
  context: { energy_level: number; stress_level: string }
): Promise<TimeBlock[]> {
  // Argentina timezone: Vercel runs UTC, Argentina = UTC-3
  const now = getCurrentTimeArg()
  const [y, m, d] = getTodayArg().split('-')
  const todayDisplay = `${d}/${m}/${y}`

  const prompt = `Eres un mentor de productividad. El usuario necesita reorganizar su plan del día.

## PLAN ACTUAL (${todayDisplay})
${JSON.stringify(currentPlan, null, 2)}

## HORA ACTUAL: ${now}

## CAMBIO REPORTADO
${change}

## CONTEXTO
- Energía actual: ${context.energy_level}/5
- Estrés: ${context.stress_level}

## INSTRUCCIONES
1. Mantené los bloques ya completados (completed: true) sin cambios
2. Solo reorganizá los bloques pendientes a partir de ${now}
3. Acomodá el cambio reportado manteniendo las prioridades académicas
4. Respondé ÚNICAMENTE con el JSON array completo (incluyendo bloques ya completados)
5. No uses markdown ni explicaciones`

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
