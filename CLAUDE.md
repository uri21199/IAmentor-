# IAmentor — Project Context for Claude

PWA de productividad académica para estudiantes universitarios argentinos que trabajan. Genera planes diarios con IA, rastrea progreso académico y entrenamientos.

**Prod:** https://iamentor.vercel.app | **Stack:** Next.js 15 App Router · TypeScript · Tailwind CSS · Supabase PostgreSQL · Claude API (claude-sonnet-4-5) · Vercel

---

## Stack & Versions

| Layer | Tech | Version |
|-------|------|---------|
| Framework | Next.js App Router | 15.4.11 |
| Language | TypeScript | 5 |
| Styling | Tailwind CSS | 3.4.1 |
| Database | Supabase PostgreSQL + RLS | 15 |
| Auth | Supabase Auth (JWT, HTTPOnly cookies) | @supabase/ssr 0.5.1 |
| AI | Anthropic Claude API | claude-sonnet-4-5, SDK 0.27.0 |
| Calendar | Google Calendar API v3 (OAuth2) | googleapis 144.x |
| Push | Web Push VAPID | web-push 3.6.7 |
| Charts | Recharts | 2.12.7 |
| DnD | @dnd-kit/core + @dnd-kit/sortable | 6.3.1 / 10.0.0 |
| Dates | date-fns | 3.6.0 |

---

## File Structure

```
app/
  (auth)/            # login, registro
  (app)/             # rutas protegidas por middleware
    today/           # plan del dia + checkin
    checkin/         # wizard 5 pasos
    subjects/        # tracker academico
    agenda/          # vista cronologica de eventos
    calendar/        # vista mensual
    gym/             # registro de entrenamientos
    stats/           # estadisticas y heatmap
    settings/        # configuracion, notificaciones, google calendar
    cuatrimestres/   # CRUD de semestres
    cursada/         # horario semanal de clases
    trabajo/         # horario y modalidad de trabajo
  api/
    ai/              # endpoints de Claude (generate-plan, insight, validate)
    calendar/        # Google Calendar OAuth
    cron/            # jobs programados
    notifications/   # motor de triggers
    plan/            # CRUD del plan diario
    progress/        # snapshots y heatmap
    push/            # envio VAPID
    topics/          # completions y alucinacion
components/
  features/          # componentes de dominio
  layout/            # nav, shell, FAB
  ui/                # componentes base reutilizables
lib/                 # utilities, supabase client, date helpers
types/index.ts       # TODOS los tipos TypeScript del proyecto
supabase/
  schema.sql         # schema base
  migrations_*.sql   # migraciones en orden v3→v9, features456
```

---

## Design System

- **Dark only** — no light mode. Background `#0A0F1E`, Surface `#111827` / `#1F2937`
- **Primary blue** — `#3B82F6`
- **Font** — DM Sans (next/font, ya cargado)
- **Radius** — `rounded-2xl` (1rem), `rounded-3xl` (1.5rem)
- **Status colors** — rojo: `bg-red-500/20 text-red-400`, amarillo: `bg-amber-500/20 text-amber-400`, verde: `bg-green-500/20 text-green-400`
- No introducir nuevos tokens de color o fuentes fuera del sistema

---

## Database — Tablas principales

| Tabla | Proposito |
|-------|-----------|
| `profiles` | datos de usuario |
| `user_config` | horario trabajo, `is_employed`, timezone |
| `semesters` | cuatrimestres |
| `subjects` | materias por cuatrimestre |
| `units` | unidades por materia |
| `topics` | temas con estado `red/yellow/green` |
| `class_schedule` | horario semanal fijo |
| `daily_plans` | plan generado por IA del dia |
| `checkins` | estado diario (sueno, energia, estres) |
| `academic_events` | parciales, TPs, eventos personales |
| `class_logs` | registro post-clase con temas vistos |
| `topic_completions` | deteccion de alucinacion de progreso |
| `progress_snapshots` | heatmap de dominio semanal |
| `workouts` | registros de gym |
| `notifications` | motor de alertas con deduplicacion UNIQUE |
| `push_subscriptions` | subscripciones VAPID |
| `pomodoro_sessions` | sesiones pomodoro |

**RLS**: TODAS las tablas tienen RLS. Siempre incluir `user_id = auth.uid()` en policies. Nunca omitir RLS al crear tablas nuevas.

---

## Fechas y Timezone

- La DB guarda todo en **UTC**
- El servidor Vercel corre en **UTC**
- Ajuste a **UTC-3 (Argentina)** se hace SIEMPRE en el cliente con `date-fns`
- Nunca asumir timezone del servidor. Usar `new Date()` con cuidado en server components

---

## Patrones de Claude API

Los prompts de IA estan en `app/api/ai/`. Tres endpoints principales:
- `generate-plan`: recibe checkin + eventos + clases → devuelve bloques JSON del plan
- `insight`: genera insight semanal (3 oraciones)
- `validate-progress`: micro-validacion cognitiva cuando hay alucinacion de progreso (usa Haiku)

El modelo base es `claude-sonnet-4-5`. Solo `validate-progress` usa Haiku (rapido y barato).

---

## Convenciones de codigo

- Server Components por defecto; `'use client'` solo cuando necesario
- Supabase client: `lib/supabase/` — usar `createServerClient` en RSC/API routes, `createBrowserClient` en client components
- Tipos globales en `types/index.ts` — agregar tipos nuevos ahi, no en archivos individuales
- No usar `any` — inferir tipos desde Supabase o definirlos en `types/index.ts`
- Tailwind clases: usar `clsx` + `tailwind-merge` para clases condicionales

---

## Backlog prioritario (no implementado aun)

- Streaming SSE en generacion del plan (elimina espera de 5s) — **Alta**
- Rate limiting en `/api/ai/*` con Upstash Redis — **Alta (seguridad)**
- Upgrade Next.js a 15.x (vulnerabilidad conocida en 14.2.15) — **Alta (seguridad)**
- Loading skeletons en paginas SSR — **Media**
- Plan pre-generado a las 6 AM via Vercel Cron — **Alta**

---

## MCP disponibles en este proyecto

- **Supabase MCP**: acceso directo a DB, schema, migraciones y tipos TypeScript. Usar para explorar tablas antes de escribir queries.
- **Context7 MCP**: documentacion actualizada de Next.js 14, Tailwind, Supabase, date-fns. Usar con `use context7` en el prompt cuando necesites docs precisas.

---

## Registro de cambios — OBLIGATORIO

**Al finalizar cualquier sesión donde se modifiquen archivos del proyecto, se DEBE agregar una entrada en `CHANGELOG.md`.**

### Formato de entrada

```md
## [YYYY-MM-DD #N] — Título descriptivo del cambio

**Fecha / Hora:** YYYY-MM-DD, mañana/tarde/noche
**MCP / Skills:** herramientas de IA utilizadas (o — si ninguna)
**Secciones:** área del producto afectada

### Archivos modificados
- `ruta/al/archivo.tsx`

### Cambios técnicos
- Qué cambió a nivel de código/lógica

### Cambios en UX
- Qué experimenta distinto el usuario

### Cambios visuales
- Qué debería verse diferente en pantalla
```

- El número `#N` es correlativo por día (si ya hay una entrada del mismo día, usar `#2`, `#3`, etc.)
- Omitir secciones que no apliquen (ej: si no hay cambios visuales, no incluir esa sección)
- Agregar la entrada **al principio** del archivo, debajo del título `# IAmentor — Registro de Cambios`
