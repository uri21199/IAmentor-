/**
 * IAmentor — E2E Test Suite
 * Run: npx ts-node --project tests/tsconfig.json tests/e2e-flow.ts
 */

import path from 'path'
import dotenv from 'dotenv'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { format, addDays } from 'date-fns'

// ── Load env ──────────────────────────────────────────────────
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!
const API_BASE      = 'http://localhost:3000'
const PROJECT_REF   = new URL(SUPABASE_URL).hostname.split('.')[0]
const TEST_EMAIL    = 'test@iamentor.com'
const TEST_PASS     = 'Test1234!'
const TODAY         = format(new Date(), 'yyyy-MM-dd')
const TODAY_DOW     = new Date().getDay() // 0=Dom … 6=Sáb

// ── Clients ───────────────────────────────────────────────────
const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── State ─────────────────────────────────────────────────────
const results: { step: string; ok: boolean; detail?: string }[] = []
let userId: string | null = null
let sessionCookies        = ''
let generatedPlan: any[]  = []

// ── Helpers ───────────────────────────────────────────────────
const GREEN  = '\x1b[32m'
const RED    = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN   = '\x1b[36m'
const DIM    = '\x1b[2m'
const RESET  = '\x1b[0m'

function pass(step: string, detail?: string) {
  results.push({ step, ok: true, detail })
  console.log(`  ${GREEN}✅${RESET} ${step}${detail ? DIM + ' — ' + detail + RESET : ''}`)
}

function fail(step: string, detail: string) {
  results.push({ step, ok: false, detail })
  console.log(`  ${RED}❌${RESET} ${step} ${DIM}— ${detail}${RESET}`)
}

function info(msg: string) {
  console.log(`  ${DIM}${msg}${RESET}`)
}

/** Encode a Supabase session into SSR-compatible cookies (chunked at 3180 bytes) */
function buildAuthCookies(session: any): string {
  const CHUNK = 3180
  const json  = JSON.stringify(session)
  const key   = `sb-${PROJECT_REF}-auth-token`
  if (json.length <= CHUNK) {
    return `${key}=${encodeURIComponent(json)}`
  }
  const parts: string[] = []
  for (let i = 0; i < json.length; i += CHUNK) {
    parts.push(`${key}.${Math.floor(i / CHUNK)}=${encodeURIComponent(json.slice(i, i + CHUNK))}`)
  }
  return parts.join('; ')
}

// ─────────────────────────────────────────────────────────────
// PASO 1 — Crear usuario + perfil + seed
// ─────────────────────────────────────────────────────────────
async function step1_createUser(): Promise<boolean> {
  console.log(`\n${CYAN}📋 PASO 1 — Crear usuario${RESET}`)

  // 1a. Create via admin API
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASS,
    email_confirm: true,
    user_metadata: { full_name: 'Test User' },
  })
  if (authErr || !authData?.user) {
    fail('Crear usuario auth', authErr?.message ?? 'Sin respuesta')
    return false
  }
  userId = authData.user.id
  pass('Usuario creado', `ID: ${userId}`)

  // 1b. Verify or create profile (trigger may or may not be set)
  await new Promise(r => setTimeout(r, 800))
  const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).single()
  if (profile) {
    pass('Perfil auto-creado por trigger', `email: ${profile.email}`)
  } else {
    await admin.from('profiles').insert({ id: userId, email: TEST_EMAIL, full_name: 'Test User' })
    pass('Perfil creado manualmente (trigger no configurado en esta DB)')
  }

  // 1c. Run seed
  const { error: seedErr } = await admin.rpc('seed_initial_data', { p_user_id: userId })
  if (seedErr) {
    fail('seed_initial_data()', seedErr.message)
    return false
  }
  const { data: subjects } = await admin.from('subjects').select('id, name').eq('user_id', userId)
  pass('seed_initial_data()', `${subjects?.length ?? 0} materias: ${subjects?.map(s => s.name).join(', ')}`)

  // 1d. Get topics count
  const subIds = subjects?.map(s => s.id) ?? []
  const { data: units }  = await admin.from('units').select('id').in('subject_id', subIds)
  const unitIds = units?.map(u => u.id) ?? []
  const { data: topics } = await admin.from('topics').select('id').in('unit_id', unitIds)
  pass('Temas seed', `${topics?.length ?? 0} temas en ${units?.length ?? 0} unidades`)

  // 1e. Sign in to build auth cookies for API calls
  const anonClient = createClient(SUPABASE_URL, ANON_KEY)
  const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASS,
  })
  if (signInErr || !signIn?.session) {
    fail('Sign in para sesión API', signInErr?.message ?? 'Sin sesión')
    return false
  }
  sessionCookies = buildAuthCookies(signIn.session)
  pass('Sesión auth construida para API', `token: ${signIn.session.access_token.slice(0, 20)}...`)
  return true
}

// ─────────────────────────────────────────────────────────────
// PASO 2 — Horario de trabajo
// ─────────────────────────────────────────────────────────────
async function step2_workConfig(): Promise<boolean> {
  console.log(`\n${CYAN}📋 PASO 2 — Configurar horario de trabajo${RESET}`)

  const { error } = await admin.from('user_config').insert({
    user_id: userId,
    work_days_json: [1, 2, 3, 4, 5],
    work_start: '09:00',
    work_end: '18:00',
    work_default_mode: 'mixto',
    presential_days_json: [1, 3], // Lunes y Miércoles
  })
  if (error) { fail('Insertar user_config', error.message); return false }

  const { data } = await admin.from('user_config').select('*').eq('user_id', userId).single()
  if (!data) { fail('Verificar user_config', 'Fila no encontrada'); return false }

  pass('user_config insertado', `${data.work_start}–${data.work_end}, modo: ${data.work_default_mode}`)
  pass('Días presenciales', `[${data.presential_days_json.join(', ')}] → Lun y Mié`)
  return true
}

// ─────────────────────────────────────────────────────────────
// PASO 3 — Clases fijas
// ─────────────────────────────────────────────────────────────
async function step3_classSchedule(): Promise<boolean> {
  console.log(`\n${CYAN}📋 PASO 3 — Cargar clases fijas${RESET}`)

  const { data: subjects } = await admin.from('subjects').select('id, name').eq('user_id', userId)
  if (!subjects?.length) { fail('Obtener materias', 'No hay materias'); return false }

  const find = (kw: string) => subjects.find(s => s.name.toLowerCase().includes(kw.toLowerCase()))
  const algo     = find('Algoritmos')
  const fisica   = find('Física')
  const quimica  = find('Química')
  const anatomia = find('Anatomía')

  if (!algo || !fisica || !quimica || !anatomia) {
    fail('Buscar materias del seed', `Encontradas: ${subjects.map(s => s.name).join(', ')}`)
    return false
  }

  const classes = [
    { subject_id: algo.id,     day_of_week: 1, start_time: '10:00', end_time: '12:00', modality: 'presencial', label: 'Algoritmos — Lun 10–12 (pres)' },
    { subject_id: fisica.id,   day_of_week: 2, start_time: '14:00', end_time: '16:00', modality: 'virtual',    label: 'Física — Mar 14–16 (virt)'     },
    { subject_id: quimica.id,  day_of_week: 4, start_time: '09:00', end_time: '11:00', modality: 'presencial', label: 'Química — Jue 09–11 (pres)'     },
    { subject_id: anatomia.id, day_of_week: 5, start_time: '08:00', end_time: '10:00', modality: 'virtual',    label: 'Anatomía — Vie 08–10 (virt)'   },
  ]

  const { error } = await admin.from('class_schedule').insert(
    classes.map(({ label: _label, ...c }) => ({ ...c, user_id: userId, is_active: true }))
  )
  if (error) { fail('Insertar class_schedule', error.message); return false }

  const { data: inserted } = await admin.from('class_schedule').select('*').eq('user_id', userId)
  pass('class_schedule insertado', `${inserted?.length ?? 0} clases`)
  classes.forEach(c => info(`    • ${c.label}`))
  return true
}

// ─────────────────────────────────────────────────────────────
// PASO 4 — Fechas académicas
// ─────────────────────────────────────────────────────────────
async function step4_academicEvents(): Promise<boolean> {
  console.log(`\n${CYAN}📋 PASO 4 — Cargar fechas académicas${RESET}`)

  const { data: subjects } = await admin.from('subjects').select('id, name').eq('user_id', userId)
  const find = (kw: string) => subjects?.find(s => s.name.toLowerCase().includes(kw.toLowerCase()))
  const quimica = find('Química')
  const algo    = find('Algoritmos')
  const fisica  = find('Física')

  if (!quimica || !algo || !fisica) { fail('Buscar materias', 'No encontradas'); return false }

  const events = [
    { subject_id: quimica.id, type: 'parcial',           title: 'Parcial Química Básica',        date: format(addDays(new Date(), 10), 'yyyy-MM-dd'), days: 10 },
    { subject_id: algo.id,    type: 'entrega_tp',         title: 'Entrega TP Algoritmos y Prog.', date: format(addDays(new Date(),  5), 'yyyy-MM-dd'), days: 5  },
    { subject_id: fisica.id,  type: 'parcial_intermedio', title: 'Parcial Intermedio Física',     date: format(addDays(new Date(), 20), 'yyyy-MM-dd'), days: 20 },
  ]

  const { error } = await admin.from('academic_events').insert(
    events.map(({ days: _days, ...e }) => ({ ...e, user_id: userId, notes: null }))
  )
  if (error) { fail('Insertar academic_events', error.message); return false }

  const { data: inserted } = await admin.from('academic_events').select('*').eq('user_id', userId)
  pass('academic_events insertados', `${inserted?.length ?? 0} eventos`)
  events.forEach(e => info(`    • ${e.title} → en ${e.days} días (${e.date})`))
  return true
}

// ─────────────────────────────────────────────────────────────
// PASO 5 — Check-in
// ─────────────────────────────────────────────────────────────
async function step5_checkin(): Promise<boolean> {
  console.log(`\n${CYAN}📋 PASO 5 — Simular check-in de hoy${RESET}`)

  // Presencial si hoy es Lunes(1) o Miércoles(3), sino remoto
  const workMode = [1, 3].includes(TODAY_DOW) ? 'presencial' : 'remoto'
  const dowName  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][TODAY_DOW]
  info(`    Hoy es ${dowName} (DOW=${TODAY_DOW}) → work_mode=${workMode}`)

  const { error } = await admin.from('checkins').insert({
    user_id: userId,
    date: TODAY,
    sleep_quality: 4,
    energy_level: 4,
    stress_level: 'low',
    work_mode: workMode,
    has_faculty: true,
    faculty_mode: 'presencial',
    faculty_subject: null,
    travel_route_json: [
      { origin: 'Casa',     destination: 'Trabajo',   duration_minutes: 40 },
      { origin: 'Trabajo',  destination: 'Facultad',  duration_minutes: 30 },
      { origin: 'Facultad', destination: 'Casa',      duration_minutes: 50 },
    ],
    unexpected_events: null,
  })
  if (error) { fail('Insertar checkin', error.message); return false }

  const { data } = await admin
    .from('checkins').select('*').eq('user_id', userId).eq('date', TODAY).single()

  pass('check-in insertado', `energy=${data.energy_level}/5, stress=${data.stress_level}, work=${data.work_mode}`)
  pass('Ruta de viaje', `${data.travel_route_json.length} tramos (${data.travel_route_json.map((t: any) => t.duration_minutes + 'min').join(' + ')} = ${data.travel_route_json.reduce((s: number, t: any) => s + t.duration_minutes, 0)}min total)`)
  return true
}

// ─────────────────────────────────────────────────────────────
// PASO 6 — Llamar API de plan
// ─────────────────────────────────────────────────────────────
async function step6_planGeneration(): Promise<boolean> {
  console.log(`\n${CYAN}📋 PASO 6 — POST /api/ai/plan${RESET}`)

  if (!sessionCookies) { fail('Sin sesión', 'Paso 1 falló'); return false }

  info(`    Llamando ${API_BASE}/api/ai/plan ...`)

  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/ai/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': sessionCookies },
    })
  } catch (e: any) {
    fail('fetch /api/ai/plan', `Error de red — ¿servidor corriendo en ${API_BASE}? → ${e.message}`)
    return false
  }

  if (!res.ok) {
    const body = await res.text()
    fail(`HTTP ${res.status}`, body.slice(0, 300))
    return false
  }

  const json = await res.json()
  const blocks: any[] = json.blocks ?? json.plan_json ?? json ?? []

  if (!Array.isArray(blocks) || blocks.length === 0) {
    fail('Respuesta del plan', `Esperaba array de bloques. Recibí: ${JSON.stringify(json).slice(0, 200)}`)
    return false
  }

  generatedPlan = blocks
  pass('Plan generado exitosamente', `${blocks.length} bloques`)

  // ── Validaciones ──────────────────────────────────────────
  const has = (type: string) => blocks.some(b => b.type === type)

  // Trabajo — solo en días laborales Lun–Vie
  const isWorkDay = [1, 2, 3, 4, 5].includes(TODAY_DOW)
  if (isWorkDay) {
    has('work') ? pass('Incluye bloque de TRABAJO') : fail('Bloque de trabajo', 'No encontrado')
  } else {
    pass('Sin bloque de trabajo (correcto — hoy es fin de semana)', `DOW=${TODAY_DOW}`)
  }

  has('study')  ? pass('Incluye bloque de ESTUDIO')  : fail('Bloque de estudio', 'No encontrado')
  has('travel') ? pass('Incluye bloque de VIAJE')    : fail('Bloque de viaje',   'No encontrado')
  has('rest')   ? pass('Incluye bloque de DESCANSO') : pass('Sin descanso explícito (energía alta, aceptable)')

  // Clase — solo si hoy tiene clase configurada (Lun=1, Mar=2, Jue=4, Vie=5)
  const classDays = [1, 2, 4, 5]
  if (classDays.includes(TODAY_DOW)) {
    has('class') ? pass('Incluye bloque de CLASE (día correcto)') : fail('Bloque de clase', `No encontrado (DOW=${TODAY_DOW})`)
  } else {
    pass('Sin bloque de clase (correcto — hoy no hay clases configuradas)', `DOW=${TODAY_DOW}`)
  }

  // Prioridad de estudio
  const studyText = blocks.filter(b => b.type === 'study')
    .map(b => `${b.title} ${b.description ?? ''}`.toLowerCase()).join(' ')
  studyText.includes('algorit')
    ? pass('Estudio prioriza ALGORITMOS (TP en 5 días)')
    : fail('Prioridad Algoritmos', `Bloques estudio: ${blocks.filter(b => b.type === 'study').map(b => b.title).join(', ')}`)
  studyText.includes('quím')
    ? pass('Estudio prioriza QUÍMICA (parcial en 10 días)')
    : fail('Prioridad Química', 'No detectada en bloques de estudio')

  // ── Imprimir plan ─────────────────────────────────────────
  console.log(`\n  ${YELLOW}📅 Plan del día (${TODAY}):${RESET}`)
  const typeIcon: Record<string, string> = { work:'💼', class:'🎓', study:'📚', travel:'🚌', gym:'💪', rest:'😴', free:'🆓' }
  blocks.forEach(b => {
    const icon = typeIcon[b.type] ?? '⬜'
    console.log(`    ${b.start_time}–${b.end_time}  ${icon} ${GREEN}[${b.type}]${RESET} ${b.title}`)
    if (b.description) info(`         └─ ${b.description.slice(0, 90)}`)
  })

  return true
}

// ─────────────────────────────────────────────────────────────
// PASO 7 — Actualizar estados de temas
// ─────────────────────────────────────────────────────────────
async function step7_topicUpdate(): Promise<boolean> {
  console.log(`\n${CYAN}📋 PASO 7 — Actualizar estados de temas post-clase${RESET}`)

  const { data: subjects } = await admin.from('subjects').select('id, name').eq('user_id', userId)
  const algo    = subjects?.find(s => s.name.includes('Algoritmos'))
  const quimica = subjects?.find(s => s.name.includes('Química'))
  if (!algo || !quimica) { fail('Buscar materias', 'No encontradas'); return false }

  const getTopics = async (subjectId: string) => {
    const { data: units } = await admin.from('units').select('id').eq('subject_id', subjectId)
    const { data: topics } = await admin.from('topics').select('id, name, status')
      .in('unit_id', units?.map(u => u.id) ?? [])
    return topics ?? []
  }

  const algoTopics = await getTopics(algo.id)
  const quimTopics = await getTopics(quimica.id)

  if (!algoTopics.length) { fail('Temas Algoritmos', 'Sin temas (seed puede no tener topics)'); }
  if (!quimTopics.length) { fail('Temas Química', 'Sin temas (seed puede no tener topics)'); }

  // Algoritmos: primer topic → yellow
  const algoT = algoTopics.find(t => t.name.toLowerCase().includes('variable')) ?? algoTopics[0]
  if (algoT) {
    await admin.from('topics').update({ status: 'yellow', last_studied: new Date().toISOString() }).eq('id', algoT.id)
    const { data: v } = await admin.from('topics').select('status').eq('id', algoT.id).single()
    v?.status === 'yellow'
      ? pass(`Algoritmos → "${algoT.name}" = yellow ✓`)
      : fail(`Algoritmos topic`, `status=${v?.status}`)
  }

  // Química: primer topic → red
  const quimT = quimTopics.find(t => t.name.toLowerCase().includes('estequi')) ?? quimTopics[0]
  if (quimT) {
    await admin.from('topics').update({ status: 'red', last_studied: new Date().toISOString() }).eq('id', quimT.id)
    const { data: v } = await admin.from('topics').select('status').eq('id', quimT.id).single()
    v?.status === 'red'
      ? pass(`Química → "${quimT.name}" = red ✓`)
      : fail(`Química topic`, `status=${v?.status}`)
  }

  return true
}

// ─────────────────────────────────────────────────────────────
// PASO 8 — Workout
// ─────────────────────────────────────────────────────────────
async function step8_workout(): Promise<boolean> {
  console.log(`\n${CYAN}📋 PASO 8 — Log de entrenamiento${RESET}`)

  const { error } = await admin.from('workouts').insert({
    user_id: userId,
    date: TODAY,
    type: 'empuje',
    duration_minutes: 45,
    energy_used: 3,
    completed: true,
    exercises_json: [
      { name: 'Press de banca', sets: 4, reps: '8-10',  rest_seconds: 90 },
      { name: 'Press inclinado', sets: 3, reps: '10-12', rest_seconds: 60 },
      { name: 'Fondos',          sets: 3, reps: '12-15', rest_seconds: 60 },
    ],
  })
  if (error) { fail('Insertar workout', error.message); return false }

  const { data } = await admin.from('workouts').select('*').eq('user_id', userId).single()
  pass('workout insertado', `${data.type} · ${data.duration_minutes}min · completed=${data.completed}`)
  pass('Ejercicios registrados', data.exercises_json.map((e: any) => e.name).join(', '))
  return true
}

// ─────────────────────────────────────────────────────────────
// PASO 9 — Reporte final
// ─────────────────────────────────────────────────────────────
async function step9_report(): Promise<void> {
  console.log(`\n${'─'.repeat(62)}`)
  console.log(`${YELLOW}📊  REPORTE FINAL${RESET}`)
  console.log(`${'─'.repeat(62)}`)

  // Stats
  const { data: subjects  } = await admin.from('subjects').select('id, name').eq('user_id', userId)
  const subIds                = subjects?.map(s => s.id) ?? []
  const { data: units     } = await admin.from('units').select('id').in('subject_id', subIds)
  const { data: topics    } = await admin.from('topics').select('id').in('unit_id', units?.map(u => u.id) ?? [])
  const { data: classes   } = await admin.from('class_schedule').select('id').eq('user_id', userId)
  const { data: events    } = await admin.from('academic_events').select('id').eq('user_id', userId)
  const { data: plans     } = await admin.from('daily_plans').select('id').eq('user_id', userId)
  const { data: workouts  } = await admin.from('workouts').select('id').eq('user_id', userId)

  console.log(`\n  ${CYAN}Estadísticas del usuario test:${RESET}`)
  console.log(`    📚 Materias:         ${subjects?.length ?? 0}  → ${subjects?.map(s => s.name).join(', ')}`)
  console.log(`    📖 Temas totales:    ${topics?.length ?? 0}`)
  console.log(`    🎓 Clases fijas:     ${classes?.length ?? 0}`)
  console.log(`    📅 Eventos académicos: ${events?.length ?? 0}`)
  console.log(`    🗓️  Planes guardados: ${plans?.length ?? 0}`)
  console.log(`    💪 Workouts:         ${workouts?.length ?? 0}`)

  // Results table
  console.log(`\n  ${CYAN}Resultados por check:${RESET}`)
  results.forEach(r => {
    const icon = r.ok ? `${GREEN}✅${RESET}` : `${RED}❌${RESET}`
    console.log(`  ${icon} ${r.step}${r.detail ? DIM + ' — ' + r.detail + RESET : ''}`)
  })

  const passed = results.filter(r => r.ok).length
  const total  = results.length
  const allOk  = passed === total

  console.log(`\n  ${'─'.repeat(50)}`)
  console.log(`  ${allOk ? GREEN : YELLOW}📈 ${passed}/${total} checks pasados${RESET}`)

  // Plan summary
  if (generatedPlan.length > 0) {
    const byType = generatedPlan.reduce((acc, b) => {
      acc[b.type] = (acc[b.type] ?? 0) + 1; return acc
    }, {} as Record<string, number>)
    console.log(`\n  Plan generado: ${Object.entries(byType).map(([k, v]) => `${k}×${v}`).join(' · ')}`)
  }

  // Cleanup
  if (allOk && userId) {
    console.log(`\n  🎉 ${GREEN}¡Todos los checks pasaron!${RESET} Limpiando usuario de test...`)
    const { error } = await admin.auth.admin.deleteUser(userId)
    error
      ? console.log(`  ${YELLOW}⚠️  No se pudo limpiar el usuario: ${error.message}${RESET}`)
      : console.log(`  🗑️  Usuario test eliminado correctamente.`)
  } else {
    console.log(`\n  ${YELLOW}⚠️  Hubo fallas — datos conservados para inspección.${RESET}`)
    console.log(`  👤 Usuario: ${TEST_EMAIL}  |  ID: ${userId}`)
  }

  console.log(`${'─'.repeat(62)}\n`)
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n╔${'═'.repeat(60)}╗`)
  console.log(`║${' '.repeat(10)}IAmentor — E2E Test Suite${' '.repeat(25)}║`)
  console.log(`╚${'═'.repeat(60)}╝`)
  console.log(`  📅 Fecha: ${TODAY}  (DOW: ${ ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][TODAY_DOW] })`)
  console.log(`  🌐 API:   ${API_BASE}`)
  console.log(`  🗄️  DB:   ${SUPABASE_URL}`)
  console.log(`  📧 User:  ${TEST_EMAIL}`)

  const steps: [string, () => Promise<boolean>][] = [
    ['Crear usuario + seed',        step1_createUser     ],
    ['Horario de trabajo',          step2_workConfig     ],
    ['Clases fijas',                step3_classSchedule  ],
    ['Fechas académicas',           step4_academicEvents ],
    ['Check-in del día',            step5_checkin        ],
    ['Generación de plan (API)',     step6_planGeneration ],
    ['Actualización de temas',      step7_topicUpdate    ],
    ['Log de entrenamiento',        step8_workout        ],
  ]

  for (const [name, fn] of steps) {
    try {
      await fn()
    } catch (err: any) {
      fail(name, `Excepción no manejada: ${err.message}`)
    }
  }

  await step9_report()
}

main().catch(err => {
  console.error(`\n${RED}💥 Error fatal:${RESET}`, err)
  process.exit(1)
})
