/**
 * db-reset.ts — Hard reset de Supabase para producción
 * Borra TODOS los datos de usuario. Mantiene la estructura de tablas.
 * Run: node node_modules/ts-node/dist/bin.js --project tests/tsconfig.json scripts/db-reset.ts
 */

import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const GREEN  = '\x1b[32m'
const RED    = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN   = '\x1b[36m'
const DIM    = '\x1b[2m'
const RESET  = '\x1b[0m'

// Orden de borrado: más dependientes primero (respeta FK)
const APP_TABLES = [
  'notifications',
  'class_schedule',
  'user_config',
  'user_integrations',
  'travel_logs',
  'workouts',
  'class_logs',
  'daily_plans',
  'checkins',
  'academic_events',
  'topics',
  'units',
  'subjects',
  'semesters',
  'profiles',
]

async function deleteAllRows(table: string): Promise<number> {
  // Fetch all IDs first to count
  const { data, error } = await admin.from(table).select('id')
  if (error) {
    // Table might not exist (e.g. notifications if migration not run)
    if (error.code === '42P01') return -1  // table doesn't exist
    throw new Error(`${table}: ${error.message}`)
  }
  const count = data?.length ?? 0
  if (count === 0) return 0

  // Delete all rows using a condition that matches everything
  const { error: delErr } = await admin.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (delErr) throw new Error(`DELETE ${table}: ${delErr.message}`)
  return count
}

async function deleteAllAuthUsers(): Promise<number> {
  const { data, error } = await admin.auth.admin.listUsers()
  if (error) throw new Error(`listUsers: ${error.message}`)
  const users = data?.users ?? []
  let deleted = 0
  for (const u of users) {
    const { error: delErr } = await admin.auth.admin.deleteUser(u.id)
    if (delErr) {
      console.log(`  ${YELLOW}⚠️  No se pudo borrar auth user ${u.email}: ${delErr.message}${RESET}`)
    } else {
      deleted++
    }
  }
  return deleted
}

async function verifyEmpty(): Promise<boolean> {
  let allEmpty = true
  for (const table of APP_TABLES) {
    const { data } = await admin.from(table).select('id').limit(1)
    if (data && data.length > 0) {
      console.log(`  ${RED}❌ ${table} aún tiene filas${RESET}`)
      allEmpty = false
    }
  }
  return allEmpty
}

async function main() {
  console.log(`\n╔${'═'.repeat(56)}╗`)
  console.log(`║${' '.repeat(8)}IAmentor — Hard Reset de Base de Datos${' '.repeat(10)}║`)
  console.log(`╚${'═'.repeat(56)}╝`)
  console.log(`  ${YELLOW}⚠️  Esto borrará TODOS los datos. La estructura se mantiene.${RESET}\n`)

  // ── 1. App tables ─────────────────────────────────────────
  console.log(`${CYAN}📋 Paso 1 — Limpiando tablas de aplicación${RESET}`)
  let totalRows = 0
  for (const table of APP_TABLES) {
    try {
      const n = await deleteAllRows(table)
      if (n === -1) {
        console.log(`  ${DIM}⏭️  ${table.padEnd(20)} (tabla no existe — ok)${RESET}`)
      } else {
        const icon = n > 0 ? `${GREEN}✅${RESET}` : `${DIM}—${RESET}`
        console.log(`  ${icon} ${table.padEnd(20)} ${DIM}${n} fila${n !== 1 ? 's' : ''} eliminada${n !== 1 ? 's' : ''}${RESET}`)
        totalRows += n
      }
    } catch (err: any) {
      console.log(`  ${RED}❌ ${table}: ${err.message}${RESET}`)
    }
  }

  // ── 2. Auth users ─────────────────────────────────────────
  console.log(`\n${CYAN}📋 Paso 2 — Eliminando usuarios de auth.users${RESET}`)
  const authDeleted = await deleteAllAuthUsers()
  console.log(`  ${GREEN}✅${RESET} ${authDeleted} usuario${authDeleted !== 1 ? 's' : ''} de auth eliminado${authDeleted !== 1 ? 's' : ''}`)

  // ── 3. Verify ─────────────────────────────────────────────
  console.log(`\n${CYAN}📋 Paso 3 — Verificando tablas vacías${RESET}`)
  await new Promise(r => setTimeout(r, 500))
  const empty = await verifyEmpty()

  // ── Report ────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(56)}`)
  if (empty) {
    console.log(`${GREEN}✅ Hard reset completo.${RESET} ${DIM}${totalRows} filas eliminadas · auth limpio${RESET}`)
    console.log(`${DIM}   La estructura del schema se mantiene intacta.${RESET}`)
    console.log(`${DIM}   Listo para el primer usuario real. 🚀${RESET}`)
  } else {
    console.log(`${YELLOW}⚠️  Algunas tablas aún tienen datos. Revisá los errores arriba.${RESET}`)
  }
  console.log(`${'─'.repeat(56)}\n`)
}

main().catch(err => {
  console.error(`\n${RED}💥 Error fatal:${RESET}`, err)
  process.exit(1)
})
