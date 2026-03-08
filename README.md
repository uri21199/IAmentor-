# 🧠 Mentor IA Personal

> PWA de productividad personal con IA generativa. Genera planes de día adaptativos basados en tu check-in matutino, eventos académicos, historial de energía y ruta de viaje.

**URL de producción:** https://iamentor.vercel.app
**Stack:** Next.js 14 · TypeScript · Tailwind CSS · Supabase · Claude API · Google Calendar

---

## Tabla de contenidos

1. [¿Qué es?](#1-qué-es)
2. [Funcionalidades](#2-funcionalidades)
3. [Stack tecnológico](#3-stack-tecnológico)
4. [Arquitectura general](#4-arquitectura-general)
5. [Estructura de archivos](#5-estructura-de-archivos)
6. [Base de datos](#6-base-de-datos)
7. [API Endpoints](#7-api-endpoints)
8. [Sistema de priorización de estudio](#8-sistema-de-priorización-de-estudio)
9. [Sistema de bloques del plan](#9-sistema-de-bloques-del-plan)
10. [Diseño y UX](#10-diseño-y-ux)
11. [Estado actual del proyecto](#11-estado-actual-del-proyecto)
12. [Limitaciones conocidas y deuda técnica](#12-limitaciones-conocidas-y-deuda-técnica)
13. [Escalabilidad — análisis y propuestas](#13-escalabilidad--análisis-y-propuestas)

---

## 1. ¿Qué es?

**Mentor IA Personal** es una Progressive Web App (PWA) diseñada para estudiantes universitarios que también trabajan. Su flujo central es:

```
Check-in matutino → IA genera plan del día → Usuario ejecuta el plan → Stats
```

Cada mañana el usuario responde 5 preguntas (calidad de sueño, energía, estrés, modo de trabajo, ruta de viaje). Con esa información, el modelo `claude-sonnet-4-5` genera un cronograma de bloques horarios que combina:

- Bloques de **trabajo** (presencial/remoto según horario configurado)
- **Clases** fijas del cuatrimestre actual
- Bloques de **estudio** priorizados por urgencia académica (parciales, TPs)
- Bloques de **viaje** con sugerencias de repaso según tema prioritario
- Bloques de **gym**, descanso y tiempo libre

La app también incluye un tracker académico (semestre → materia → unidad → tema con estado rojo/amarillo/verde), registro de entrenamientos y estadísticas semanales con insight IA.

---

## 2. Funcionalidades

### Implementadas

| Feature | Descripción |
|---------|-------------|
| **Onboarding** | Wizard 4 pasos: horario de trabajo, cuatrimestre, materias |
| **Check-in diario** | 5 pasos: estado físico/mental, trabajo, facultad, ruta de viaje, resumen |
| **Plan IA** | Generación con Claude + bloques determinísticos (trabajo, clases, viaje) |
| **Replanificación** | Ajusta el plan desde la hora actual ante cualquier cambio |
| **Tracker académico** | Jerarquía Semestre → Materia → Unidad → Tema (estados RGB) |
| **Log de clase** | Registra temas vistos y nivel de comprensión post-clase |
| **Tracker de gym** | Rotación 3-split (empuje/jale/piernas), ejercicios adaptativos por energía |
| **Estadísticas** | Completitud de planes, distribución de bloques, racha de estudio |
| **Integración Calendar** | OAuth2 Google Calendar — muestra eventos del día en el plan |
| **Insight semanal** | Resumen de la semana generado por Claude |
| **Settings** | CRUD de cuatrimestres, horario de trabajo |
| **PWA** | Service worker (next-pwa), manifest, instalable en Android e iOS |
| **Auth** | Email + password vía Supabase Auth (magic link disponible) |
| **Error boundaries** | `error.tsx` en `(app)/` y root |
| **Accesibilidad** | ARIA labels en nav, `aria-current`, viewport-fit sin `user-scalable=no` |

### Backlog (pendiente)

| Feature | Prioridad |
|---------|-----------|
| Loading skeletons en páginas SSR | Media |
| Persistir borrador del check-in en `localStorage` | Media |
| Error toasts visibles al usuario en fallos de API | Media |
| Focus trap en modales (SubjectDetail, Settings) | Baja |
| Iconos PWA reales (192px, 512px, apple-touch) | Baja |
| Fix ESLint `no-explicit-any` (~21 archivos) | Baja |
| Streaming SSE en generación del plan | Alta (UX) |
| Generación pre-emptiva del plan (cron 6 AM) | Alta (UX) |
| Push notifications (VAPID) | Media |

---

## 3. Stack tecnológico

```
Frontend     │ Next.js 14.2.15 (App Router), TypeScript 5, Tailwind CSS 3
Hosting      │ Vercel (Edge + Serverless Functions, región iad1)
Base datos   │ Supabase (PostgreSQL 15, RLS habilitado en todas las tablas)
Auth         │ Supabase Auth (JWT en cookies HTTPOnly, magic link + password)
IA           │ Anthropic Claude API — modelo: claude-sonnet-4-5
Calendario   │ Google Calendar API v3 (OAuth2, refresh automático de tokens)
PWA          │ next-pwa 5.6 (Workbox 6, precaching de assets estáticos)
Tipografía   │ DM Sans (Google Fonts via next/font)
Gráficos     │ Recharts 2.x
Fechas       │ date-fns 3.6
Testing      │ ts-node 10.9 + Supabase Admin API (integración E2E)
```

### Dependencias clave

| Paquete | Versión | Rol |
|---------|---------|-----|
| `@supabase/ssr` | 0.5.1 | Manejo de cookies SSR para auth en Server Components |
| `@supabase/supabase-js` | 2.x | Cliente DB + Auth lado cliente |
| `@anthropic-ai/sdk` | 0.27.0 | Cliente Claude API |
| `googleapis` | 140.x | Google Calendar OAuth2 + API v3 |
| `next-pwa` | 5.6.0 | Service Worker + precaching (Workbox) |
| `recharts` | 2.x | Gráficos en StatsClient |
| `date-fns` | 3.6.0 | Manipulación de fechas ISO |
| `dotenv` | 17.x | Lectura de `.env.local` en scripts/tests |
| `ts-node` | 10.9.2 | Ejecución de tests TypeScript |

---

## 4. Arquitectura general

```
┌─────────────────────────────────────────────────────────────┐
│                      BROWSER / PWA                          │
│   Next.js Client Components  ←→  Service Worker (Workbox)  │
│   (React, Tailwind, Recharts)     (precache, offline shell) │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS / Cookies HTTPOnly
┌────────────────────────▼────────────────────────────────────┐
│                 NEXT.JS APP (Vercel)                        │
│                                                             │
│  middleware.ts → Auth guard + redirects                     │
│                                                             │
│  Route Groups:                                              │
│  ├── (auth)/login              Login page                   │
│  ├── /onboarding               Setup inicial (nuevo usuario)│
│  ├── (app)/today               Plan del día                 │
│  ├── (app)/checkin             Wizard check-in 5 pasos      │
│  ├── (app)/subjects/[id]       Tracker académico            │
│  ├── (app)/gym                 Tracker gym                  │
│  ├── (app)/stats               Estadísticas                 │
│  └── (app)/settings            Config cuatrimestre          │
│                                                             │
│  API Routes (Serverless Functions):                         │
│  ├── POST /api/ai/plan         Genera plan con Claude       │
│  ├── POST /api/ai/replan       Replanifica desde hora actual│
│  ├── GET  /api/ai/weekly-insight  Insight semanal IA        │
│  ├── GET  /api/calendar/auth      Inicia OAuth Google       │
│  ├── GET  /api/calendar/callback  Intercambia code→tokens   │
│  ├── GET  /api/calendar/events    Eventos del día           │
│  ├── GET  /api/notifications      Lista notificaciones      │
│  └── PATCH /api/plan/update-block Toggle bloque completado  │
└──────────┬────────────────────────────┬─────────────────────┘
           │                            │
┌──────────▼──────────┐    ┌────────────▼──────────────────┐
│     SUPABASE        │    │       ANTHROPIC API           │
│  PostgreSQL 15      │    │   claude-sonnet-4-5           │
│  Auth (JWT/cookies) │    │   ~2-8s por llamada           │
│  RLS en todas tablas│    └───────────────────────────────┘
│  Storage (futuro)   │
└─────────────────────┘
           │
┌──────────▼──────────┐
│   GOOGLE APIs       │
│  Calendar API v3    │
│  OAuth2 tokens      │
└─────────────────────┘
```

### Flujo de autenticación

```
1. Usuario ingresa email + password en /login
2. Supabase Auth valida credenciales → devuelve JWT + refresh token
3. @supabase/ssr guarda tokens en cookies HTTPOnly chunkeadas
4. middleware.ts corre en cada request → verifica sesión → redirige si expirada
5. Server Components usan createServerSupabaseClient() → lee cookies → queries con RLS
6. Client Components usan createClient() → client-side Supabase
```

### Flujo de generación del plan diario

```
POST /api/ai/plan
  ├── 1. Verifica auth (getUser)
  ├── 2. Fetch check-in del día (Supabase)
  ├── 3. Fetch semestre activo + materias + unidades + temas (Supabase)
  ├── 4. Fetch academic_events próximos 30 días (Supabase)
  ├── 5. Fetch checkins últimos 7 días para historial de energía (Supabase)
  ├── 6. [paralelo] Fetch user_config + class_schedule del día (Supabase Promise.all)
  ├── 7. Fetch Google Calendar events (con refresh de token si expiró)
  │
  ├── 8. Construir fixedBlocks (determinístico):
  │       ├── work block (si hoy es día laboral y work_mode ≠ libre)
  │       ├── class blocks (según class_schedule del DOW)
  │       └── travel blocks (de checkin.travel_route_json, posicionados por ancla)
  │
  ├── 9. calculateStudyPriorities() → array ordenado por urgencia + debilidad
  │
  ├── 10. generateDailyPlan(context) → Claude API → TimeBlock[] JSON
  │
  ├── 11. Merge fixedBlocks + claudeBlocks → sort por start_time
  ├── 12. UPSERT daily_plans en Supabase
  └── 13. Return { blocks: TimeBlock[] }
```

---

## 5. Estructura de archivos

```
IAmentor/
├── app/
│   ├── layout.tsx                     Root layout (DM Sans, viewport, theme color)
│   ├── page.tsx                       Redirect raíz (middleware maneja)
│   ├── globals.css                    Minimal CSS (dark theme vía Tailwind)
│   ├── error.tsx                      Root error boundary (client component)
│   ├── (auth)/
│   │   └── login/page.tsx             Magic link + password login
│   ├── (app)/
│   │   ├── layout.tsx                 App shell con BottomNav + padding bottom
│   │   ├── error.tsx                  App-level error boundary con botón "Reintentar"
│   │   ├── today/
│   │   │   ├── page.tsx               Server: 4 queries paralelas (Promise.all)
│   │   │   └── TodayClient.tsx        Client: render plan, toggle bloques, replan
│   │   ├── checkin/page.tsx           Wizard 5 pasos completo (client component)
│   │   ├── subjects/
│   │   │   ├── page.tsx               Server: lista materias del semestre activo
│   │   │   └── [id]/
│   │   │       ├── page.tsx           Server: fetch materia + unidades + temas
│   │   │       └── SubjectDetailClient.tsx  Client: toggle topics RGB, log clase, add evento
│   │   ├── gym/
│   │   │   ├── page.tsx               Server: fetch workouts + siguiente tipo
│   │   │   └── GymClient.tsx          Client: render rutina adaptativa, log workout
│   │   ├── stats/
│   │   │   ├── page.tsx               Server: fetch datos de stats (7/30 días)
│   │   │   └── StatsClient.tsx        Client: gráficos recharts, racha, completitud
│   │   └── settings/page.tsx          CRUD cuatrimestres + config horario (client)
│   ├── onboarding/
│   │   ├── page.tsx                   Server: redirect si user_config ya existe
│   │   └── OnboardingClient.tsx       Wizard 4 pasos: trabajo, semestre, materias, listo
│   └── api/
│       ├── ai/
│       │   ├── plan/route.ts          POST: genera plan completo con Claude
│       │   ├── replan/route.ts        POST: replanifica desde hora actual
│       │   └── weekly-insight/route.ts GET: insight semanal IA (3 oraciones)
│       ├── calendar/
│       │   ├── auth/route.ts          GET: redirect OAuth Google
│       │   ├── callback/route.ts      GET: code → tokens → guarda en user_integrations
│       │   └── events/route.ts        GET: eventos hoy (con refresh token auto)
│       ├── notifications/
│       │   ├── route.ts               GET/POST: notificaciones del usuario
│       │   └── [id]/route.ts          PATCH: marcar notificación como leída
│       └── plan/
│           └── update-block/route.ts  PATCH: toggle completed + recalcula % completitud
│
├── components/
│   ├── ui/
│   │   ├── Button.tsx                 Variantes: primary, secondary, ghost, danger + loading
│   │   ├── Card.tsx                   Variantes: default, elevated, gradient
│   │   ├── Badge.tsx                  Badge de color dinámico (para materias)
│   │   ├── ProgressBar.tsx            Barra animada de progreso (0-100%)
│   │   ├── EmojiSelector.tsx          Selector de valores con emojis (energía 1-5, estrés)
│   │   ├── TimeBlock.tsx              Componente bloque horario con toggle completado
│   │   └── TopicPill.tsx              Pill de tema con estado red/yellow/green
│   ├── layout/
│   │   └── BottomNav.tsx              Nav fija bottom, ARIA completo, aria-current
│   └── features/
│       ├── ReplanButton.tsx           Botón replanificar con estado loading
│       └── NotificationBanner.tsx     Banner de notificaciones pendientes
│
├── lib/
│   ├── supabase.ts                    createClient() — client components
│   ├── supabase-server.ts             createServerSupabaseClient() — server/API routes
│   ├── anthropic.ts                   generateDailyPlan(), replanDay(), weeklyInsight()
│   ├── google-calendar.ts             getTodayEvents(), refreshAccessToken()
│   ├── study-priority.ts              Algoritmo puro de priorización (sin efectos)
│   ├── exercises.ts                   DB local de ejercicios + integración wger REST API
│   └── utils.ts                       cn(), formatTime(), etc.
│
├── types/
│   └── index.ts                       Todos los tipos TypeScript del dominio
│
├── supabase/
│   ├── schema.sql                     Schema completo + RLS + seed_initial_data()
│   └── migrations_v3.sql              Tablas adicionales: profiles, user_config, class_schedule, notifications
│
├── scripts/
│   └── db-reset.ts                    Hard reset de todas las tablas (para producción)
│
├── tests/
│   ├── e2e-flow.ts                    Suite E2E: 9 pasos, 23 checks, usuario completo
│   └── tsconfig.json                  TS config para tests (module: commonjs)
│
├── public/
│   └── manifest.json                  PWA manifest (name, icons, theme_color, display)
│
├── middleware.ts                       Auth guard: protege rutas app, redirige a /login
├── next.config.js                     PWA config, ignoreBuildErrors/ESLint habilitado
├── tailwind.config.ts                 Design tokens (background, surface, primary, etc.)
├── tsconfig.json                      TypeScript config (paths: @/* → ./*)
└── .env.local                         Variables secretas (gitignored — ver SETUP.md)
```

---

## 6. Base de datos

### Diagrama de relaciones

```
auth.users  ← Supabase gestionado
    │
    ├─── profiles         id, email, full_name, avatar_url
    │                     [auto-creado por trigger handle_new_user()]
    │
    ├─── user_config      work_days_json[], work_start, work_end,
    │                     work_default_mode, presential_days_json[]
    │
    ├─── user_integrations  provider('google_calendar'), access_token,
    │                        refresh_token, token_expiry
    │
    ├─── notifications    title, body, type, read, action_url
    │
    └─── semesters        name, start_date, end_date, is_active
              │
              └─── subjects  name, color (#hex)
                       │
                       ├─── units          name, order_index
                       │        │
                       │        └─── topics  name, full_description,
                       │                      status(red|yellow|green),
                       │                      last_studied, next_review
                       │
                       ├─── academic_events  type, title, date, notes
                       │                     type: parcial | parcial_intermedio | entrega_tp
                       │
                       └─── class_schedule   day_of_week(0-6), start_time, end_time,
                                              modality(presencial|virtual), is_active

(user_id sin FK jerárquica — acceso directo)
    ├─── checkins      date, sleep_quality(1-5), energy_level(1-5), stress_level,
    │                  work_mode, has_faculty, faculty_mode, travel_route_json[]
    │
    ├─── daily_plans   date, plan_json(TimeBlock[]), completion_percentage
    │
    ├─── class_logs    date, subject_id, topics_covered_json[], understanding_level, has_homework
    │
    ├─── workouts      date, type, duration_minutes, energy_used, completed, exercises_json[]
    │
    └─── travel_logs   date, origin, destination, duration_minutes, topic_studied_id
```

### RLS — patrón aplicado en todas las tablas

```sql
-- Cada tabla tiene 3 políticas:
POLICY "select_own"  FOR SELECT  USING (auth.uid() = user_id)
POLICY "insert_own"  FOR INSERT  WITH CHECK (auth.uid() = user_id)
POLICY "update_own"  FOR UPDATE  USING (auth.uid() = user_id)
```

### Función seed (datos de ejemplo)

```sql
-- Crea 4 materias con 17 unidades y 69 temas para un usuario
SELECT seed_initial_data('USER-UUID-AQUI');

-- Materias incluidas:
-- Química Básica (estequiometría, enlace, equilibrio, termodinámica)
-- Anatomía e Histología (células, tejidos, órganos)
-- Física de Partículas (mecánica, electromagnetismo, ondas)
-- Algoritmos y Programación (variables, estructuras, POO)
```

### Índices recomendados para escala

```sql
-- Queries más frecuentes que necesitan índice
CREATE INDEX idx_checkins_user_date     ON checkins(user_id, date);
CREATE INDEX idx_daily_plans_user_date  ON daily_plans(user_id, date);
CREATE INDEX idx_topics_unit_status     ON topics(unit_id, status);
CREATE INDEX idx_academic_events_date   ON academic_events(user_id, date);
CREATE INDEX idx_workouts_user_date     ON workouts(user_id, date);
```

---

## 7. API Endpoints

### `POST /api/ai/plan`
Genera el plan completo del día.

- **Auth:** Cookie de sesión Supabase (HTTPOnly)
- **Body:** ninguno — lee check-in del día desde DB
- **Response:** `{ blocks: TimeBlock[] }`
- **Latencia típica:** 3-8 segundos (dominado por Claude API)
- **Nota:** Los bloques de trabajo, clase y viaje son determinísticos; Claude genera el resto

---

### `POST /api/ai/replan`
Replanifica desde la hora actual.

- **Body:** `{ current_plan: TimeBlock[], change_description: string }`
- **Response:** `{ blocks: TimeBlock[] }`

---

### `GET /api/ai/weekly-insight`
Resumen IA de la semana.

- **Response:** `{ insight: string }` — 3 oraciones en español argentino
- **Cache recomendado:** 24 horas (el insight no cambia durante el día)

---

### `GET /api/calendar/auth`
Inicia el flujo OAuth2 con Google.

- **Response:** Redirect a `accounts.google.com/o/oauth2/auth`
- **Scopes solicitados:** `calendar.events.readonly`

---

### `GET /api/calendar/callback`
Completa el OAuth y guarda tokens.

- **Query params:** `code`, `state`
- **Acción:** Intercambia code → access_token + refresh_token → UPSERT en `user_integrations`
- **Response:** Redirect a `/settings`

---

### `GET /api/calendar/events`
Eventos del día desde Google Calendar.

- **Acción:** Refresca token si expiró antes de llamar
- **Response:** `{ events: [] }` (array de eventos formateados)

---

### `PATCH /api/plan/update-block`
Toggle completado de un bloque.

- **Body:** `{ date: string, block_id: string, completed: boolean }`
- **Acción:** Actualiza `plan_json` en `daily_plans` + recalcula `completion_percentage`
- **Response:** `{ ok: true, completion_percentage: number }`

---

### `GET|POST /api/notifications`
- **GET:** Lista notificaciones no leídas del usuario
- **POST:** Crea nueva notificación

### `PATCH /api/notifications/[id]`
Marca notificación como leída.

---

## 8. Sistema de priorización de estudio

**Archivo:** `lib/study-priority.ts` — funciones puras, sin efectos secundarios, testables de forma aislada.

### Función principal

```typescript
calculateStudyPriorities({
  subjects: SubjectWithDetails[],
  academic_events: AcademicEvent[],
  reference_date?: Date,
}): StudyPriorityResult[]
// Devuelve array ordenado de mayor a menor priority_score
```

### Algoritmo de scoring

```
priority_score = urgency_score + weakness_score

── URGENCY SCORE ────────────────────────────────────────
base_score por tipo de evento:
  parcial              → 100
  entrega_tp           → 80
  parcial_intermedio   → 70

time_multiplier según días hasta el evento:
  ≤ 3 días  → ×3.0  (crítico: exam week)
  ≤ 7 días  → ×2.0  (urgente: próxima semana)
  ≤ 14 días → ×1.5  (próximo: dos semanas)
  > 14 días → ×1.0  (normal)

urgency_score = max(base_score × time_multiplier, por todos los eventos de esa materia)

── WEAKNESS SCORE ───────────────────────────────────────
weakness_score = Σ(status_weight × count)
  red    topics → 10 pts/tema  (no estudiado / muy débil)
  yellow topics → 5 pts/tema   (visto pero no consolidado)
  green  topics → 1 pt/tema    (dominado)
```

### Modo de estudio adaptativo

```typescript
determineStudyMode(daysToEvent):
  ≤ 3 días  → 'exam_prep'     // ejercicios de práctica intensiva
  ≤ 7 días  → 'active_review' // repasar + hacer ejercicios
  ≤ 14 días → 'normal'        // avance normal del temario
  > 14 días → 'light'         // repaso liviano, avance lento
```

### Función para bloques de viaje

```typescript
selectTravelStudyTopic(priorities, duration_minutes):
// Elige el tema con status 'red' de la materia más urgente
// que sea factible repasar en el tiempo disponible del viaje
```

---

## 9. Sistema de bloques del plan

### Tipos de bloques (`BlockType`)

| Tipo | Origen | Descripción |
|------|--------|-------------|
| `work` | Determinístico | Bloque laboral según user_config |
| `class` | Determinístico | Clase según class_schedule del día |
| `travel` | Determinístico | Segmento de viaje de checkin |
| `study` | Claude | Bloque de estudio priorizado |
| `gym` | Claude | Entrenamiento según rutina |
| `rest` | Claude | Descanso, comida, pausa |
| `free` | Claude | Tiempo libre |

### Posicionamiento de bloques de viaje

```
checkin.travel_route_json = [
  { origin: 'Casa',    destination: 'Trabajo',  duration: 40min },
  { origin: 'Trabajo', destination: 'Facultad', duration: 30min },
  { origin: 'Facultad',destination: 'Casa',     duration: 50min },
]

Lógica:
  segmentos[0..N-2] → ANTES del primer bloque fijo (work/class)
                       cursor = firstBlock.start - Σ(durations N-1)
  segmento[N-1]     → DESPUÉS del último bloque fijo
                       start = lastBlock.end
```

### Estructura `TimeBlock`

```typescript
interface TimeBlock {
  id: string               // 'fixed_work' | 'fixed_class_{id}' | 'travel_{n}' | UUID
  start_time: string       // "HH:MM" (24h, Argentina timezone)
  end_time: string         // "HH:MM"
  type: BlockType
  title: string            // Título mostrado al usuario
  description: string      // Descripción / consejos
  subject_id?: string      // Para bloques study/class
  topic_id?: string        // Para bloques study/travel
  travel_segment?: TravelSegment
  completed: boolean
  priority?: 'low' | 'medium' | 'high' | 'exam'
}
```

---

## 10. Diseño y UX

### Design tokens (Tailwind)

```
FONDOS
  bg-background   #0A0F1E    Fondo principal (casi negro azulado)
  bg-surface      #111827    Cards, nav, modales
  bg-surface-2    #1F2937    Inputs, items secundarios

COLORES
  primary         #3B82F6    Azul — acciones principales
  cyan            #06B6D4    Accents, highlights
  green           #10B981    Éxito, temas dominados (verde)
  amber           #F59E0B    Advertencia, temas en progreso (amarillo)
  red             #EF4444    Error, temas débiles (rojo)

TEXTO
  text-primary    #F9FAFB
  text-secondary  #9CA3AF
  text-muted      #6B7280

BORDES
  border-subtle   rgba(255,255,255,0.08)

TIPOGRAFÍA
  font-sans       DM Sans (pesos: 300, 400, 500, 600, 700)
```

### Reglas de accesibilidad aplicadas

- Touch targets mínimos: `min-h-[44px]` (WCAG 2.5.5)
- Nav bottom: `aria-label="Navegación principal"` + `aria-current="page"` en item activo
- Viewport: `viewport-fit=cover` (sin `user-scalable=no`, cumple WCAG 2.5.4)
- Error boundaries con mensaje legible y botón de acción

### Componentes UI

| Componente | Variantes | Notas |
|-----------|-----------|-------|
| `Button` | primary, secondary, ghost, danger | Prop `loading` muestra spinner |
| `Card` | default, elevated, gradient | Gradiente para cards destacadas |
| `Badge` | color dinámico | Recibe `color` hex de la materia |
| `TimeBlock` | por `BlockType` | Icono + color por tipo |
| `TopicPill` | red / yellow / green | Click cicla estados |
| `EmojiSelector` | escalas de valores | Energía 1-5, estrés low/med/high |
| `ProgressBar` | animada | Muestra % completitud del plan |

---

## 11. Estado actual del proyecto

| Área | Estado | Notas |
|------|--------|-------|
| Auth + Onboarding | ✅ Funcional | Wizard 4 pasos completo |
| Check-in diario | ✅ Funcional | 5 pasos, travel_route incluido |
| Plan IA | ✅ Funcional | Bloques determinísticos garantizados |
| Replanificación | ✅ Funcional | Ajusta desde hora actual |
| Tracker académico | ✅ Funcional | CRUD temas, log clase, add eventos |
| Gym tracker | ✅ Funcional | Rotación 3-split, adaptativo por energía |
| Estadísticas | ✅ Funcional | Gráficos recharts, racha, completitud |
| Google Calendar | ✅ Funcional | OAuth2 completo + token refresh |
| PWA | ✅ Funcional | SW generado, manifest, instalable |
| Notificaciones | ✅ API creada | UI y SW push pendientes |
| Deploy Vercel | ✅ Live | https://iamentor.vercel.app |
| Tests E2E | ✅ 23/23 | Suite completa, idempotente |
| DB producción | ✅ Vacía | Hard reset ejecutado, lista para usuarios |
| GitHub remote | ❌ Pendiente | Solo backup local actualmente |

---

## 12. Limitaciones conocidas y deuda técnica

### Seguridad
- `next@14.2.15` tiene una vulnerabilidad conocida ([ver advisory](https://nextjs.org/blog/security-update-2025-12-11)). Upgrade a 15.x pendiente.
- Las credenciales de Google Calendar se guardan en `user_integrations` como texto plano. Para escalar, cifrar con AES-256 antes de guardar.

### Código
- ESLint desactivado durante el build (`ignoreDuringBuilds: true`). ~21 archivos con `no-explicit-any` sin tipar correctamente.
- `next-pwa@5.6.0` usa Workbox 6 (deprecado). Migrar a `@ducanh2912/next-pwa` o `next-pwa@6`.
- No hay CI/CD — el deploy es manual con `vercel --prod`.
- Sin GitHub remote configurado (no hay backup remoto del código).

### UX
- Sin loading skeletons → pantalla en blanco durante SSR de `today/` y `stats/`.
- Errores de Claude API o Google Calendar son silenciosos para el usuario.
- El wizard de check-in (5 pasos) no persiste en localStorage.
- Los iconos PWA no existen → la instalación no muestra el ícono correcto.

### Performance
- Sin caché: cada request genera nuevas llamadas a DB y Claude API.
- Sin rate limiting en `/api/ai/*` → una llamada maliciosa puede agotar créditos.
- Índices de DB no optimizados para volumen (ver sección escalabilidad).

---

## 13. Escalabilidad — análisis y propuestas

### Cuellos de botella actuales

```
1. Claude API: 3-8s de latencia por llamada
   → Impacto: la pantalla de "Hoy" tarda varios segundos en cargar el plan
   → Solución inmediata: streaming SSE (muestra bloques a medida que llegan)
   → Solución estructural: generar el plan a las 6 AM vía Vercel Cron Job

2. Supabase Free Tier: 500MB, 50 conexiones simultáneas
   → Impacto: colapsa con >20-30 usuarios concurrentes
   → Solución: Supabase Pro ($25/mes) + PgBouncer connection pooling

3. Sin rate limiting en AI endpoints
   → Riesgo: abuso o bug que agote los créditos de Anthropic
   → Solución: Upstash Redis + sliding window (10 requests/hora/usuario)

4. Sin índices de DB para queries frecuentes
   → Solución: CREATE INDEX en (user_id, date) para checkins, daily_plans, workouts
```

### Roadmap de escalabilidad por etapa

```
ETAPA 1 — 0 a 1.000 usuarios activos  (~$50/mes)
  ✅ Vercel Hobby o Pro (escala automático)
  ✅ Supabase Pro ($25/mes) — 8GB, 500 conexiones
  ✅ Agregar índices DB
  ✅ Rate limiting con Upstash Redis ($10/mes)
  ✅ Streaming SSE en /api/ai/plan

ETAPA 2 — 1.000 a 50.000 usuarios  (~$200/mes)
  + Vercel KV para cachear planes por usuario (TTL 6h)
  + Caché de study priorities por (user_id, date) — TTL 15min
  + Generación pre-emptiva del plan a las 6 AM (Vercel Cron)
  + Supabase Pro con read replica para queries de lectura
  + Monitoreo: Sentry (errores) + Vercel Analytics

ETAPA 3 — 50.000+ usuarios  (~$1.000+/mes)
  + Arquitectura multi-región (Vercel Edge Functions globales)
  + Separar servicio de IA (microservicio dedicado con cola BullMQ)
  + PostgreSQL en Neon o PlanetScale con sharding por user_id
  + CDN para assets estáticos (Cloudflare)
  + Multi-tenant: soporte para instituciones educativas
```

### Features de alto impacto para retención y crecimiento

| Feature | Impacto en retención | Complejidad técnica |
|---------|---------------------|---------------------|
| Streaming SSE del plan | 🔴 Muy alto — elimina la espera de 5s | Baja (1-2 días) |
| Plan pre-generado a las 6 AM | 🔴 Muy alto — plan listo al despertar | Media (Vercel Cron) |
| Notificaciones push (VAPID) | 🟡 Alto — recordatorios de check-in | Media (service worker) |
| Modo offline (PWA sync) | 🟡 Alto — funciona sin conexión | Alta |
| Exportar plan a PDF / ics | 🟡 Medio — compartir con tutor | Baja |
| Grupos de estudio | 🔵 Bajo — planes compartidos | Alta |
| API pública (canvas/moodle) | 🔵 Bajo — integración institucional | Alta |

### Propuesta de arquitectura para 100k usuarios

```
┌─────────────────────────────────────────────────┐
│  CDN / Edge — Vercel Edge Network               │
│  Caché assets + ISR + middleware auth en Edge   │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│  API Layer — Vercel Serverless + Edge Functions  │
│  ├── Rate limiting (Upstash Redis)              │
│  ├── Streaming SSE para Claude responses        │
│  └── Background Jobs (Vercel Cron a las 6 AM)  │
└──────┬──────────────────────────┬───────────────┘
       │                          │
┌──────▼────────┐   ┌─────────────▼───────────┐
│  DB           │   │  Cache Layer            │
│  PostgreSQL   │   │  Vercel KV:             │
│  + PgBouncer  │   │  ├── daily_plans (6h)   │
│  + Read       │   │  ├── study_priorities   │
│    Replicas   │   │  └── weekly_insights    │
└───────────────┘   └─────────────────────────┘
```
