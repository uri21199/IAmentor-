# IAmentor — Personal AI Mentor

> PWA de productividad académica y personal impulsada por Claude AI. Genera planes diarios adaptativos, rastrea progreso académico por tema, gestiona entrenamientos con sobrecarga progresiva y envía alertas inteligentes antes de parciales y entregas.

**URL de producción:** https://iamentor.vercel.app
**Stack:** Next.js 14 · TypeScript · Tailwind CSS · Supabase · Claude API (claude-sonnet-4-5) · Google Calendar

---

## Tabla de contenidos

1. [¿Qué es?](#1-qué-es)
2. [Funcionalidades](#2-funcionalidades)
3. [Stack tecnológico](#3-stack-tecnológico)
4. [Arquitectura general](#4-arquitectura-general)
5. [Estructura de archivos](#5-estructura-de-archivos)
6. [Base de datos](#6-base-de-datos)
7. [API Endpoints](#7-api-endpoints)
8. [Lógica de IA — Prompting Strategy](#8-lógica-de-ia--prompting-strategy)
9. [Sistema de priorización de estudio](#9-sistema-de-priorización-de-estudio)
10. [Sistema de notificaciones](#10-sistema-de-notificaciones)
11. [Sistema de bloques del plan](#11-sistema-de-bloques-del-plan)
12. [Sistema de gym](#12-sistema-de-gym)
13. [Tipos TypeScript principales](#13-tipos-typescript-principales)
14. [Diseño y UX](#14-diseño-y-ux)
15. [Estado actual del proyecto](#15-estado-actual-del-proyecto)
16. [Limitaciones conocidas y deuda técnica](#16-limitaciones-conocidas-y-deuda-técnica)
17. [Oportunidades de mejora](#17-oportunidades-de-mejora)
18. [Escalabilidad](#18-escalabilidad)
19. [Detección de Alucinación de Progreso](#19-detección-de-alucinación-de-progreso)
20. [Heatmap de Dominio Académico](#20-heatmap-de-dominio-académico)
21. [Ajuste por Carga Cognitiva](#21-ajuste-por-carga-cognitiva)

---

## 1. ¿Qué es?

**IAmentor** es una Progressive Web App diseñada para estudiantes universitarios en Argentina que también trabajan. Su flujo central es:

```
Check-in matutino (5 pasos) → IA genera plan del día → Usuario ejecuta → Stats semanales
```

Cada mañana el usuario responde sobre su estado (sueño, energía, estrés, trabajo, viaje). Con esa información, `claude-sonnet-4-5` genera un cronograma de bloques horarios que combina:

- **Trabajo** (presencial/remoto según horario configurado en `user_config`)
- **Clases** fijas del cuatrimestre actual (de `class_schedule`)
- **Estudio** priorizado por urgencia académica (parciales, TPs, temas débiles)
- **Viaje** con sugerencias de repaso del tema más urgente
- **Gym**, descanso y tiempo libre

La app mantiene una jerarquía académica completa (cuatrimestre → materia → unidad → tema con estado rojo/amarillo/verde), notificaciones inteligentes con alertas en cascada ante eventos académicos, y registro de entrenamientos con sobrecarga progresiva.

---

## 2. Funcionalidades

### Implementadas

| Feature | Descripción |
|---------|-------------|
| **Auth** | Email + password via Supabase Auth. Middleware SSR protege todas las rutas `/app/*`. |
| **Onboarding** | Wizard 4 pasos: horario de trabajo, cuatrimestre, materias, confirmación. |
| **Check-in diario** | 5 pasos: estado físico, trabajo (omitido si `is_employed=false`), facultad, viaje, resumen. |
| **Plan IA** | Generación con Claude. Bloques de trabajo/clase/viaje son determinísticos; Claude llena el resto. |
| **Replanificación** | Ajusta el plan desde la hora actual describiendo el cambio ("me enfermé", "reunión extra"). |
| **Tracker académico** | Jerarquía Cuatrimestre → Materia → Unidad → Tema con estado rojo/amarillo/verde. |
| **Parsing de PDF con IA** | Sube programa de materia o calendario → Claude extrae temas y fechas de parciales automáticamente. |
| **Notificaciones inteligentes** | 7 tipos de alertas. Motor de triggers puro. Push via VAPID. Deduplicación automática. |
| **Gym tracker** | Rotación automática (empuje/jale/piernas/cardio/movilidad). 48 ejercicios. Sobrecarga progresiva. |
| **Google Calendar** | OAuth2 completo + refresh token automático. Los eventos del día se inyectan en el plan. |
| **Estadísticas** | Completion %, energía por día, dominio por materia, workouts semanales. Charts con Recharts. |
| **Insight semanal IA** | Claude genera 3 oraciones: patrón positivo, área a mejorar, recomendación concreta. |
| **Pomodoro** | Componente `PomodoroFocus.tsx` incluido. |
| **Detección de Alucinación de Progreso** | Detecta si el usuario marca > 3 temas como dominados en < 2 horas y activa una micro-validación cognitiva generada por Claude Haiku. Si falla → revierte el tema a `yellow`. |
| **Heatmap de Dominio Académico** | CSS-grid heatmap en la pantalla de Stats: filas = materias, columnas = semanas (8 semanas). Verde = dominado, amber = progreso, rojo = débil. Alerta automática si una materia lleva > 7 días sin actividad. |
| **Ajuste por Carga Cognitiva** | `getWorkoutPlan()` detecta el `study_mode` activo (exam_prep / active_review). En semana de parciales fuerza movilidad (20 min) aunque la energía sea alta. Banner contextual en la pantalla de Gym. |
| **PWA** | Service Worker (next-pwa), manifest, instalable en Android e iOS vía Safari. |
| **Settings** | Google Calendar, push notifications toggle, info de la app. |
| **Configuración** | CRUD de cuatrimestres, horario de clases semanal, horario y modalidad de trabajo. |
| **Error boundaries** | `error.tsx` en raíz y en `(app)/`. |

### Backlog / Pendiente

| Feature | Prioridad |
|---------|-----------|
| Streaming SSE en generación del plan (UX: elimina espera de 5s) | Alta |
| Plan pre-generado a las 6 AM via Vercel Cron Job | Alta |
| Loading skeletons en páginas SSR | Media |
| UI para `travel_logs` (qué estudié en el viaje) | Media |
| Vista de planes históricos (el dato existe en `daily_plans`) | Media |
| Vista de calendario semanal del plan | Media |
| Persistir borrador del check-in en localStorage | Media |
| Error toasts visibles en fallos de API | Media |
| Rate limiting en `/api/ai/*` (Upstash Redis) | Alta (seguridad) |
| Upgrade Next.js a 15.x (vulnerabilidad conocida en 14.2.15) | Alta (seguridad) |
| UI de registro post-clase (tabla `class_logs` existe) | Baja |
| Focus trap en modales | Baja |
| Íconos PWA reales (192px, 512px, apple-touch) | Baja |
| Exportar plan a PDF o `.ics` | Baja |

---

## 3. Stack tecnológico

```
Frontend     │ Next.js 14.2.15 (App Router), TypeScript 5, Tailwind CSS 3.4.1
Hosting      │ Vercel (serverless, UTC — app ajusta a UTC-3 Argentina)
Base datos   │ Supabase PostgreSQL 15 + RLS en todas las tablas
Auth         │ Supabase Auth (JWT en cookies HTTPOnly, @supabase/ssr 0.5.1)
IA           │ Anthropic Claude API — claude-sonnet-4-5 — SDK 0.27.0
Calendario   │ Google Calendar API v3 (OAuth2, refresh automático de tokens)
Push         │ Web Push / VAPID via web-push 3.6.7
PWA          │ next-pwa 5.6.0 (Workbox 6, precaching de assets)
Tipografía   │ DM Sans (Google Fonts via next/font)
Gráficos     │ Recharts 2.12.7
Fechas       │ date-fns 3.6.0
DnD          │ @dnd-kit/core 6.3.1 + @dnd-kit/sortable 10.0.0
```

### Dependencias clave

| Paquete | Versión | Rol |
|---------|---------|-----|
| `@anthropic-ai/sdk` | 0.27.0 | Cliente Claude API |
| `@supabase/ssr` | 0.5.1 | Auth SSR en Server Components y middleware |
| `@supabase/supabase-js` | 2.45.4 | Cliente DB + Auth lado cliente |
| `googleapis` | 144.x | Google Calendar OAuth2 + API v3 |
| `web-push` | 3.6.7 | Envío de push notifications VAPID |
| `next-pwa` | 5.6.0 | Service Worker + precaching (Workbox) |
| `recharts` | 2.12.7 | Gráficos en StatsClient |
| `@dnd-kit/*` | 6-10 | Drag & drop de bloques del plan |
| `date-fns` | 3.6.0 | Manipulación de fechas ISO |
| `clsx` + `tailwind-merge` | latest | Utilidades de clases Tailwind |

---

## 4. Arquitectura general

```
┌─────────────────────────────────────────────────────────────┐
│                      BROWSER / PWA                          │
│   Next.js Client Components  ←→  Service Worker (Workbox)  │
│   (React, Tailwind, Recharts, dnd-kit)  (precache, push)   │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS / Cookies HTTPOnly
┌────────────────────────▼────────────────────────────────────┐
│                NEXT.JS APP (Vercel Serverless)               │
│                                                             │
│  middleware.ts → Auth guard (verifica sesión en toda ruta)  │
│                                                             │
│  Route Groups (App Router):                                 │
│  ├── (auth)/login          Landing + auth form              │
│  ├── /onboarding           Setup inicial (nuevo usuario)    │
│  ├── (app)/today           Plan del día (SSR)               │
│  ├── (app)/checkin         Wizard 5 pasos                   │
│  ├── (app)/subjects/[id]   Tracker académico (SSR)          │
│  ├── (app)/gym             Tracker gym                      │
│  ├── (app)/stats           Estadísticas (charts)            │
│  ├── (app)/calendar        Vista de calendario              │
│  ├── (app)/agenda          Vista de agenda                  │
│  ├── (app)/notifications   Lista de notificaciones          │
│  └── (app)/settings/*      Google Calendar, push, config   │
│                                                             │
│  API Routes (Serverless Functions):                         │
│  ├── POST /api/ai/plan              Claude → plan del día   │
│  ├── POST /api/ai/replan            Claude → reajuste       │
│  ├── POST /api/ai/weekly-insight    Claude → resumen semanal│
│  ├── POST /api/ai/parse-syllabus    Claude → temas de PDF   │
│  ├── POST /api/ai/parse-events      Claude → eventos de PDF │
│  ├── GET  /api/calendar/auth        Inicia OAuth Google     │
│  ├── GET  /api/calendar/callback    Code → tokens           │
│  ├── GET  /api/calendar/events      Eventos del día         │
│  ├── PATCH /api/plan/update-block   Toggle completado       │
│  ├── GET  /api/notifications        Evalúa triggers + lista │
│  ├── PATCH /api/notifications/[id]  Marcar como leída       │
│  ├── POST /api/push/subscribe       Registrar suscripción   │
│  └── POST /api/push/send            Enviar push (interno)   │
└──────────┬────────────────────────────┬─────────────────────┘
           │                            │
┌──────────▼──────────┐    ┌────────────▼──────────────────┐
│     SUPABASE        │    │       ANTHROPIC API           │
│  PostgreSQL 15      │    │   claude-sonnet-4-5           │
│  Auth (JWT/cookies) │    │   ~3-8s latencia              │
│  RLS en todas tablas│    └───────────────────────────────┘
└─────────────────────┘
           │
┌──────────▼──────────┐
│   GOOGLE APIs       │
│  Calendar API v3    │
│  OAuth2 + refresh   │
└─────────────────────┘
```

### Flujo de autenticación

```
1. Usuario ingresa email + password en /login
2. Supabase Auth valida → devuelve JWT + refresh token
3. @supabase/ssr guarda tokens en cookies HTTPOnly chunkeadas
4. middleware.ts corre en cada request → verifica sesión → redirige a /login si expirada
5. Server Components usan createServerSupabaseClient() → queries con RLS activo
6. Client Components usan createClient() → cliente Supabase browser-side
```

### Flujo de generación del plan diario

```
POST /api/ai/plan
  ├── 1. Verifica auth (supabase.auth.getUser())
  ├── 2. Fetch check-in del día
  ├── 3. Fetch semestre activo + materias + unidades + temas (árbol completo)
  ├── 4. Fetch academic_events próximos 30 días
  ├── 5. Fetch checkins últimos 7 días (historial de energía)
  ├── 6. [Promise.all] Fetch user_config + class_schedule del DOW actual
  ├── 7. Fetch eventos Google Calendar del día (con refresh automático de token)
  │
  ├── 8. Construir fixedBlocks (determinísticos, sin IA):
  │       ├── work block (si es día laboral y work_mode ≠ libre)
  │       ├── class blocks (según class_schedule del día)
  │       └── travel blocks (de checkin.travel_route_json, posicionados por ancla)
  │
  ├── 9. calculateStudyPriorities() → array ordenado [urgencia × debilidad]
  │
  ├── 10. generateDailyPlan(context) → Anthropic SDK → TimeBlock[] JSON
  │
  ├── 11. Merge fixedBlocks + claudeBlocks, sort por start_time
  ├── 12. UPSERT en daily_plans (preserva completion_percentage existente)
  └── 13. Return { blocks: TimeBlock[] }
```

---

## 5. Estructura de archivos

```
IAmentor/
├── app/
│   ├── layout.tsx                      Root: DM Sans, viewport, registro SW, metadata
│   ├── page.tsx                        Redirect raíz (middleware maneja auth)
│   ├── globals.css                     Minimal CSS — dark theme 100% via Tailwind
│   ├── error.tsx                       Root error boundary
│   ├── (auth)/
│   │   └── login/page.tsx              Landing con features + auth form email/password
│   ├── (app)/
│   │   ├── layout.tsx                  App shell con BottomNav + safe-area padding
│   │   ├── error.tsx                   App error boundary con botón "Reintentar"
│   │   ├── today/
│   │   │   ├── page.tsx                SSR: fetch paralelo checkin/plan/events/subjects
│   │   │   └── TodayClient.tsx         Plan diario, toggle bloques, edit modals, replan
│   │   ├── checkin/page.tsx            Wizard 5 pasos + auto-genera plan al guardar
│   │   ├── calendar/
│   │   │   ├── page.tsx
│   │   │   └── CalendarClient.tsx      Vista de calendario
│   │   ├── agenda/
│   │   │   ├── page.tsx
│   │   │   └── AgendaClient.tsx        Vista de agenda
│   │   ├── subjects/
│   │   │   ├── page.tsx                SSR: lista materias del semestre activo
│   │   │   ├── SubjectsClient.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx            SSR: fetch materia + árbol unidades/temas
│   │   │       └── SubjectDetailClient.tsx  Toggle RGB, add evento, upload PDF
│   │   ├── gym/
│   │   │   ├── page.tsx
│   │   │   └── GymClient.tsx           Rutina adaptativa, ejercicios, mark complete
│   │   ├── stats/
│   │   │   ├── page.tsx
│   │   │   └── StatsClient.tsx         Charts recharts + resumen semanal IA
│   │   ├── notifications/page.tsx      Lista de notificaciones con deep links
│   │   └── settings/
│   │       ├── page.tsx                Google Calendar + push toggle + app info
│   │       ├── semesters/page.tsx      CRUD cuatrimestres
│   │       ├── classes/page.tsx        Horario de cursada semanal
│   │       └── work/page.tsx           Config horario laboral y modalidad
│   ├── onboarding/
│   │   ├── page.tsx                    Redirect si user_config ya existe
│   │   └── OnboardingClient.tsx        Wizard: trabajo → cuatrimestre → materias → listo
│   └── api/
│       ├── ai/
│       │   ├── plan/route.ts           POST: contexto completo → Claude → TimeBlock[]
│       │   ├── replan/route.ts         POST: { change } → Claude → plan actualizado
│       │   ├── weekly-insight/route.ts POST: stats semanales → Claude → 3 oraciones
│       │   ├── parse-syllabus/route.ts POST multipart: PDF/img → Claude → unidades+temas en DB
│       │   └── parse-events/route.ts   POST multipart: PDF/img → Claude → academic_events en DB
│       ├── calendar/
│       │   ├── auth/route.ts           GET: redirect a Google OAuth consent screen
│       │   ├── callback/route.ts       GET: code → tokens → UPSERT user_integrations
│       │   └── events/route.ts         GET: eventos del día con refresh automático
│       ├── plan/
│       │   └── update-block/route.ts   PATCH: guarda plan completo + recalcula completion %
│       ├── topics/
│       │   ├── complete/route.ts       POST: registra completación + detecta alucinación → desafío MCQ
│       │   └── validate/route.ts       POST: valida respuesta server-side → pasa/falla + revierte status
│       ├── progress/
│       │   └── snapshot/route.ts       POST: upsert snapshot diario · GET: grid semanal para heatmap
│       ├── notifications/
│       │   ├── route.ts                GET: evalúa triggers + persiste + retorna no leídas
│       │   └── [id]/route.ts           PATCH: marcar como leída + retorna target_path
│       └── push/
│           ├── subscribe/route.ts      POST: registrar/eliminar suscripción push
│           └── send/route.ts           POST: fire push via web-push (llamada interna)
│
├── components/
│   ├── ui/
│   │   ├── Button.tsx                  Variantes: primary, secondary, ghost, danger. Prop `loading`.
│   │   ├── Card.tsx                    Variantes: default, elevated, gradient
│   │   ├── Badge.tsx                   Badge de color dinámico (hex de materia)
│   │   ├── ProgressBar.tsx             Barra animada de progreso (0–100%)
│   │   ├── EmojiSelector.tsx           Selector con emojis (sueño 1-5, energía 1-5, estrés)
│   │   ├── TimeBlock.tsx               Bloque horario con toggle completado e ícono por tipo
│   │   └── TopicPill.tsx               Pill de tema con status red/yellow/green
│   ├── features/
│   │   ├── ReplanButton.tsx            Botón "Replanificar" con estado loading → /api/ai/replan
│   │   ├── FabMenu.tsx                 FAB global: post-clase, add evento, replan
│   │   ├── PomodoroFocus.tsx           Timer Pomodoro
│   │   ├── NotificationCenter.tsx      Dropdown/panel de notificaciones (campanita)
│   │   ├── NotificationBanner.tsx      Banner de notificación inline en la pantalla
│   │   ├── ProgressHallucinationGuard.tsx  Modal de micro-validación cognitiva (MCQ)
│   │   └── DomainHeatmap.tsx           CSS-grid heatmap de dominio por semana/materia
│   └── layout/
│       ├── BottomNav.tsx               Nav fija inferior (today/subjects/gym/stats/settings)
│       ├── SideDrawer.tsx              Menú lateral deslizable
│       └── AppShell.tsx                Header sticky + hamburguesa
│
├── lib/
│   ├── supabase.ts                     createClient() — componentes cliente
│   ├── supabase-server.ts              createServerSupabaseClient() — server/API routes
│   ├── anthropic.ts                    generateDailyPlan(), replanDay(), generateWeeklyInsight()
│   ├── google-calendar.ts              getAuthUrl(), getTokensFromCode(), getTodayEvents(), refreshAccessToken()
│   ├── study-priority.ts               Lógica PURA de priorización (sin DB, testeable)
│   ├── exercises.ts                    48 ejercicios locales + getWorkoutPlan() + getNextWorkoutType()
│   ├── utils.ts                        cn(), colores por tipo, íconos, timezone Argentina
│   ├── notifications-engine.ts         Motor PURO de triggers (sin DB, testeable)
│   └── push.ts                         Helpers web-push para enviar notificaciones
│
├── hooks/
│   └── usePushNotifications.ts         Hook client-side: suscribir/desuscribir push
│
├── types/
│   └── index.ts                        Todos los tipos TypeScript del dominio
│
├── middleware.ts                        Auth guard SSR — protege (app)/* → redirige a /login
│
├── supabase/
│   ├── schema.sql                      Schema base + RLS + seed_initial_data()
│   ├── migrations_v3.sql               profiles, user_config, class_schedule, notifications
│   ├── migrations_v4.sql               class_logs con topics_covered_json
│   ├── migrations_v5.sql               class_logs.due_date
│   ├── migrations_v6.sql               push_subscriptions, user_config.is_employed, dedup
│   ├── migrations_v7.sql               pomodoro_sessions
│   ├── migrations_v8.sql               pomodoro_sessions (versión actualizada)
│   ├── migrations_v9.sql               Smart deadline alerts: event_id, trigger_days_before, etc.
│   └── migrations_features456.sql      topic_completions + progress_snapshots (features 4-5-6)
│
├── scripts/
│   └── db-reset.ts                     Hard reset de todas las tablas (irreversible)
│
├── tests/
│   ├── e2e-flow.ts                     Suite E2E: 9 pasos, 23 checks, idempotente
│   └── tsconfig.json                   TS config para tests (module: commonjs)
│
├── public/
│   ├── manifest.json                   PWA manifest
│   └── push-sw.js                      Service Worker para push notifications
│
├── worker/
│   └── index.js                        Service Worker custom (mergeado por next-pwa)
│
├── next.config.js                       PWA + ignoreBuildErrors/ESLint habilitado
├── tailwind.config.ts                   Design tokens (background, surface, primary, etc.)
├── tsconfig.json                        TypeScript config (paths: @/* → ./*)
└── .env.local                          Variables secretas (gitignored — ver setup.md)
```

---

## 6. Base de datos

### Diagrama de relaciones

```
auth.users  ← Supabase gestionado
    │
    ├─── profiles           id, email, full_name, avatar_url
    │                       [auto-creado por trigger handle_new_user()]
    │
    ├─── user_config        work_days_json[], work_start, work_end,
    │                       work_default_mode, presential_days_json[],
    │                       is_employed (BOOLEAN)
    │
    ├─── user_integrations  provider('google_calendar'), access_token,
    │                       refresh_token, token_expiry
    │
    ├─── push_subscriptions endpoint, p256dh, auth (clave push del dispositivo)
    │
    ├─── notifications      type, title, body, message, read_status,
    │                       target_path, event_id, subject_id,
    │                       trigger_days_before, context_json, push_sent
    │
    └─── semesters          name, start_date, end_date, is_active
              │
              └─── subjects    name, color (#hex)
                       │
                       ├─── units           name, order_index
                       │        │
                       │        └─── topics  name, full_description,
                       │                     status (red|yellow|green),
                       │                     last_studied, next_review
                       │
                       ├─── academic_events  type, title, date, notes
                       │                     type: parcial | parcial_intermedio | entrega_tp
                       │
                       └─── class_schedule   day_of_week (0-6), start_time, end_time,
                                             modality (presencial|virtual), is_active

(acceso directo por user_id — sin FK jerárquica)
    ├─── checkins       date (UNIQUE/user), sleep_quality (1-5), energy_level (1-5),
    │                   stress_level (low|medium|high), work_mode, has_faculty,
    │                   faculty_mode, faculty_subject, travel_route_json[], unexpected_events
    │
    ├─── daily_plans    date (UNIQUE/user), plan_json (TimeBlock[]), completion_percentage
    │
    ├─── class_logs     date, subject_id, topics_covered_json[], understanding_level (1-5),
    │                   has_homework, homework_description, due_date
    │
    ├─── workouts       date, type (empuje|jale|piernas|cardio|movilidad),
    │                   duration_minutes, energy_used (1-5), completed,
    │                   exercises_json[], perceived_effort (easy|good|hard|exhausting)
    │
    ├─── travel_logs    date (UNIQUE/user), segments_json[], studied_during_json[]
    │
    ├─── pomodoro_sessions  start_time, end_time, topic_id, subject_id, completed
    │
    ├─── topic_completions  topic_id, subject_id, topic_name, completed_at,    [Feature 4]
    │                       challenge_question, challenge_options (JSONB),
    │                       challenge_correct_index (server-side), challenge_result
    │
    └─── progress_snapshots subject_id, snapshot_date (UNIQUE/user+subject+date), [Feature 5]
                            health_score (0.0–1.0), topics_json [{id, status}]
```

### RLS — patrón aplicado en todas las tablas

```sql
POLICY "select_own"  FOR SELECT  USING (auth.uid() = user_id)
POLICY "insert_own"  FOR INSERT  WITH CHECK (auth.uid() = user_id)
POLICY "update_own"  FOR UPDATE  USING (auth.uid() = user_id)
```

### Índices aplicados

```sql
CREATE INDEX idx_subjects_semester   ON subjects(semester_id);
CREATE INDEX idx_units_subject        ON units(subject_id);
CREATE INDEX idx_topics_unit          ON topics(unit_id);
CREATE INDEX idx_topics_status        ON topics(status);
CREATE INDEX idx_checkins_date        ON checkins(user_id, date DESC);
CREATE INDEX idx_daily_plans_date     ON daily_plans(user_id, date DESC);
CREATE INDEX idx_workouts_date        ON workouts(user_id, date DESC);
CREATE INDEX idx_academic_events_date ON academic_events(date);
```

### Función seed

```sql
-- Crea 4 materias, 17 unidades, 65+ temas para un usuario
SELECT seed_initial_data('USER-UUID-AQUI');

-- Materias:
--   Química Básica (estequiometría, enlace, equilibrio, termodinámica)
--   Anatomía e Histología (células, tejidos, órganos)
--   Física de Partículas (mecánica, electromagnetismo, ondas)
--   Algoritmos y Programación (variables, estructuras, POO)
```

---

## 7. API Endpoints

### `POST /api/ai/plan`
Genera el plan completo del día con Claude.

- **Auth:** Cookie de sesión Supabase
- **Body:** ninguno (lee check-in del día desde DB)
- **Response:** `{ blocks: TimeBlock[] }`
- **Latencia:** 3–8 segundos (dominado por Anthropic API)
- **Nota:** Bloques de trabajo/clase/viaje son determinísticos. Claude genera estudio, gym, rest, free.

### `POST /api/ai/replan`
Reajusta el plan desde la hora actual.

- **Body:** `{ change: string }` — descripción libre del cambio ("me enfermé", "reunión a las 15hs")
- **Response:** `{ blocks: TimeBlock[] }` — plan completo actualizado
- **Comportamiento:** Preserva bloques completados y con `manually_edited=true`. Solo reorganiza pendientes.

### `POST /api/ai/weekly-insight`
Resumen IA de la semana.

- **Body:** `{ avg_energy, avg_completion, total_workouts, travel_ratio, energy_by_day, top_subjects }`
- **Response:** `{ insight: string }` — 3 oraciones en español argentino

### `POST /api/ai/parse-syllabus`
Sube programa de materia → Claude extrae unidades y temas → los inserta en DB.

- **Body:** FormData `{ file: File (PDF o imagen), subject_id: string }`
- **Response:** `{ units: number, topics: number }`

### `POST /api/ai/parse-events`
Sube calendario de cátedra → Claude extrae fechas de parciales/TPs → las inserta en DB.

- **Body:** FormData `{ file: File (PDF o imagen), subject_id: string }`
- **Response:** `{ events: AcademicEvent[], count: number }`

### `GET /api/calendar/auth`
Inicia el flujo OAuth2 con Google.

- **Response:** 302 redirect a Google OAuth consent screen
- **Scopes:** `calendar.events.readonly`, `userinfo.email`

### `GET /api/calendar/callback`
Completa el OAuth y guarda tokens.

- **Query:** `code`, `error` (opcional)
- **Acción:** Intercambia code → tokens → UPSERT en `user_integrations`
- **Response:** 302 redirect a `/settings?google=success` o `?google=error`

### `GET /api/calendar/events`
Eventos del día de Google Calendar.

- **Acción:** Refresca token automáticamente si expiró
- **Response:** `{ events: GoogleCalendarEvent[], connected: boolean }`

### `PATCH /api/plan/update-block`
Guarda el plan completo y recalcula el porcentaje de completitud.

- **Body:** `{ date: string, blocks: TimeBlock[], completion_percentage: number }`
- **Response:** `{ ok: true }`

### `GET /api/notifications`
Evalúa todos los triggers, persiste nuevas notificaciones y retorna las no leídas.

- **Response:** `{ notifications: AppNotification[] }` (últimas 20, no expiradas)
- **Efecto secundario:** Persiste nuevas notificaciones. Envía push fire-and-forget para deadline alerts.

### `PATCH /api/notifications/[id]`
Marca una notificación como leída.

- **Body:** `{ read: true }`
- **Response:** `{ ok: true, target_path: string | null }`

### `POST /api/push/subscribe`
Registra o elimina una suscripción push del dispositivo.

- **Body:** `{ subscription: PushSubscription | null }` (null para desuscribir)

### `POST /api/push/send`
Envía push notification (llamada interna, requiere `INTERNAL_SECRET`).

- **Body:** `{ userId: string, notificationIds: string[] }`

### `POST /api/topics/complete` *(Feature 4)*
Registra cuando un tema es marcado como dominado (verde) y verifica si se superó el umbral de alucinación.

- **Body:** `{ topic_id, subject_id, topic_name }`
- **Lógica:** cuenta completaciones sin desafío en la ventana de 2 horas. Si `count > 3`, genera un desafío MCQ con Claude Haiku y lo persiste en `topic_completions`.
- **Response:** `{ needs_validation: false }` o `{ needs_validation: true, challenge: HallucinationChallenge }`

### `POST /api/topics/validate` *(Feature 4)*
Valida la respuesta del usuario al desafío cognitivo.

- **Body:** `{ completion_id, topic_id, selected_index, skipped? }`
- **Lógica:** recupera `challenge_correct_index` de la DB (nunca viaja al cliente). Si falla → actualiza el tema a `'yellow'` en la tabla `topics`.
- **Response:** `{ passed: boolean, new_status: 'green' | 'yellow' }`

### `POST /api/progress/snapshot` *(Feature 5)*
Upsert del snapshot diario de salud académica para todas las materias del semestre activo.

- **Body:** ninguno (calcula desde el estado actual de `topics`)
- **Response:** `{ ok: true, snapshots_created: number }`
- **Idempotente:** usa `UNIQUE(user_id, subject_id, snapshot_date)` — seguro llamarlo múltiples veces.

### `GET /api/progress/snapshot?days=56` *(Feature 5)*
Devuelve el grid agregado por semana para el heatmap.

- **Query:** `days` (default 56 = 8 semanas)
- **Response:** `{ subjects[], weeks[], labels[], grid: Record<subject_id, Record<week_key, number|null>>, inactive_subjects[] }`

---

## 8. Lógica de IA — Prompting Strategy

### Generación del plan diario (`lib/anthropic.ts → generateDailyPlan()`)

**Modelo:** `claude-sonnet-4-5`

**Contexto que recibe Claude:**
- Check-in completo del día (sueño, energía, estrés, trabajo, facultad, viaje)
- Historial de energía de los últimos 7 días
- Hora actual (Argentina UTC-3) y día de la semana
- Eventos de Google Calendar del día (como bloques fijos)
- Materias con árbol completo de unidades y temas + su estado (red/yellow/green)
- Eventos académicos próximos 30 días con días restantes calculados
- Array de `StudyPriorityResult[]` con scores de urgencia + debilidad
- Bloques fijos ya construidos (work, class, travel) para que los respete

**Reglas que se instruyen a Claude:**
- Nunca solapar bloques con los fijos (work, class, travel, calendar)
- Nunca modificar bloques con `manually_edited=true` (marcados con ⚠️ en el prompt)
- Respetar horarios de comida argentinos: almuerzo 12:30–14:00, merienda 16:30–17:30, cena 21:00–22:30
- Adaptar intensidad según energía: energía ≤2 → sesiones de 25 min con breaks frecuentes
- Priorizar temas con status rojo de materias con eventos próximos
- Para bloques de viaje: sugerir el tema más urgente + link `topic_id`
- Devolver únicamente JSON puro (`TimeBlock[]`) sin markdown ni explicaciones

### Replanificación (`replanDay()`)

- Recibe el plan actual completo + la descripción del cambio
- Claude reorganiza solo los bloques pendientes desde el momento actual en adelante
- Bloques completados y `manually_edited=true` son inmutables
- El cambio se appenda a `unexpected_events` en el check-in para auditoría

### Resumen semanal (`generateWeeklyInsight()`)

- **Output:** 3 oraciones en español argentino
- **Estructura:** 1 patrón positivo + 1 área a mejorar + 1 recomendación concreta
- **Input:** métricas agregadas de la semana (energía promedio, completion %, workouts, ratio de estudio en viaje)

### Parsing de PDF / imagen

**`parse-syllabus`:**
- Prompt: identifica la estructura de unidades y temas del programa
- Reglas: 2–15 temas por unidad máximo, infiere estructura si no es explícita, ignora páginas de presentación
- Inserta directamente en DB (`units` + `topics`) con status inicial `'red'`

**`parse-events`:**
- Prompt: extrae fechas de parciales, TPs y eventos del calendario de cátedra
- Reglas: solo fechas `YYYY-MM-DD`, omite "a definir", infiere año del contexto
- Tipos reconocidos: `parcial`, `parcial_intermedio`, `entrega_tp`
- Inserta directamente en DB (`academic_events`)

---

## 9. Sistema de priorización de estudio

**Archivo:** `lib/study-priority.ts` — funciones puras, sin efectos secundarios, testables de forma aislada.

### Función principal

```typescript
calculateStudyPriorities({
  subjects: SubjectWithDetails[],   // árbol completo con unidades y temas
  academic_events: AcademicEvent[], // eventos próximos
  reference_date?: Date,            // defaults a hoy UTC-3
}): StudyPriorityResult[]
// Array ordenado de mayor a menor priority_score
```

### Algoritmo de scoring

```
priority_score = urgency_score + weakness_score

── URGENCY SCORE ────────────────────────────────────────────
base_score por tipo de evento:
  parcial              → 100
  parcial_intermedio   → 70
  entrega_tp           → 80

time_multiplier según días hasta el evento:
  ≤ 3 días  → ×3.0   (exam_prep: crítico)
  ≤ 7 días  → ×2.0   (active_review: urgente)
  ≤ 14 días → ×1.5   (normal: próximo)
  > 14 días → ×1.0   (light: puede esperar)

urgency_score = max(base_score × time_multiplier) entre todos los eventos de esa materia

── WEAKNESS SCORE ───────────────────────────────────────────
weakness_score = Σ(status_weight × count_de_temas)
  red    → 10 pts/tema   (no estudiado / muy débil)
  yellow → 5 pts/tema    (visto pero no consolidado)
  green  → 1 pt/tema     (dominado)
```

### Modo de estudio adaptativo

```typescript
determineStudyMode(daysToEvent):
  ≤ 3 días  → 'exam_prep'     // ejercicios de práctica intensiva
  ≤ 7 días  → 'active_review' // repasar + hacer ejercicios
  ≤ 14 días → 'normal'        // avance normal del temario
  > 14 días → 'light'         // repaso liviano, avance lento
```

### Selección de tema para bloques de viaje

```typescript
selectTravelStudyTopic(priorities, duration_minutes):
// Selecciona el tema con status 'red' de la materia con mayor priority_score
// que sea factible repasar en el tiempo disponible del viaje
```

### Otras funciones exportadas

- `calculateEventUrgencyScore(events, subjectId, refDate)` → score + días restantes
- `calculateTopicWeaknessScore(topics)` → score total de debilidad
- `getTopicsByPriority(topics)` → ordenados red → yellow → green + last_studied ASC
- `getDaysColor(days)` → `'green' | 'amber' | 'red'` (para UI)
- `getEventTypeLabel(type)` → nombre localizado en español

---

## 10. Sistema de notificaciones

**Archivo:** `lib/notifications-engine.ts` — funciones puras, sin DB, testables.

### Tipos de notificación

| Tipo | Trigger | Expiración |
|------|---------|-----------|
| `post_class` | 15–90 min después de que termina una clase (según `class_schedule`) | 2 horas post-clase |
| `energy_boost` | Energía ≥4 en check-in + plan tiene mayormente bloques livianos | 4 horas después |
| `exam_alert` | Examen ≤7 días + hay temas en rojo | Fin del día |
| `early_win` | Examen en 8–30 días → sesión corta de 30 min sugerida | Fin del día |
| `exam_approaching` | Umbral exacto: 14/10/7/5/1/0 días antes de un parcial | Fin del día del evento |
| `deadline_approaching` | Ídem para TPs / entregas | Fin del día del evento |
| `exam_today` | El día mismo del examen | Fin del día |

### Motor de triggers (`evaluateTriggers()`)

```typescript
// Funciones puras que retornan PendingNotification[]
buildPostClassTriggers(input)     // Revisa class_schedule del día vs hora actual
buildExamAlertTrigger(input)      // Revisa academic_events ≤7 días + temas rojos
buildEnergyBoostTrigger(input)    // Revisa energy_level del check-in + bloques del plan
buildEarlyWinTrigger(input)       // Revisa academic_events 8-30 días
checkAndScheduleAlerts(input)     // Deadline alerts en umbrales exactos
```

### Deduplicación

- **Tipos legacy** (post_class, energy_boost, exam_alert, early_win): un registro por día por tipo por usuario
- **Deadline alerts**: un registro permanente por par `(event_id, trigger_days_before)` — nunca se vuelve a disparar

### Flujo en `GET /api/notifications`

```
1. evaluateTriggers() → PendingNotification[] (sin DB)
2. checkAndScheduleAlerts() → más PendingNotifications (deadline type)
3. Dedup contra notificaciones existentes en DB
4. INSERT nuevas notificaciones en `notifications`
5. Fire-and-forget: POST /api/push/send con IDs de deadline alerts nuevas
6. SELECT últimas 20 no leídas y no expiradas
7. Return { notifications }
```

### Push notifications

- Claves VAPID generadas con `npx web-push generate-vapid-keys`
- Service Worker en `public/push-sw.js` maneja el evento `push`
- Suscripción guardada en tabla `push_subscriptions`
- Solo se envían push para deadline alerts recién creadas
- El endpoint `/api/push/send` requiere el header `X-Internal-Secret` para autenticación interna

### Mensajes de ejemplo

```
post_class:          "📚 Terminó Algoritmos. ¿Cargás los temas que viste hoy?"
                     → deep link: /subjects/[id]?action=post_clase

energy_boost:        "⚡ Tenés energía 4/5 y el plan tiene tareas livianas. ¿Replanificás?"
                     → deep link: /today?action=replan

exam_alert:          "🎯 Parcial de Química en 3 días. Tenés 5 temas en rojo."
                     → deep link: /subjects/[id]

exam_approaching:    "Química Básica — Parcial en 7 días"
                     body: "5 temas en rojo. Modo: active_review. Planificá 2h/día."
```

---

## 11. Sistema de bloques del plan

### Tipos de bloques (`BlockType`)

| Tipo | Origen | Color | Ícono |
|------|--------|-------|-------|
| `work` | Determinístico | Azul (primary) | 💼 |
| `class` | Determinístico | Cyan | 🎓 |
| `travel` | Determinístico | Naranja | 🚌 |
| `study` | Claude | Amber | 📚 |
| `gym` | Claude | Verde | 💪 |
| `rest` | Claude | Gris | 😴 |
| `free` | Claude | Violeta | 🎮 |

### Posicionamiento de viajes

```
checkin.travel_route_json = [
  { origin: 'Casa',    destination: 'Trabajo',   duration_minutes: 40 },
  { origin: 'Trabajo', destination: 'Facultad',  duration_minutes: 30 },
  { origin: 'Facultad',destination: 'Casa',      duration_minutes: 50 },
]

Lógica de inserción:
  segmentos [0..N-2] → ANTES del primer bloque fijo (work/class)
                        cursor = firstFixedBlock.start - Σ(durations)
  segmento [N-1]     → DESPUÉS del último bloque fijo
                        start = lastFixedBlock.end
```

### Estructura `TimeBlock`

```typescript
interface TimeBlock {
  id: string               // 'fixed_work' | 'fixed_class_{id}' | 'travel_{n}' | UUID
  start_time: string       // "HH:MM" (24h, timezone Argentina)
  end_time: string         // "HH:MM"
  type: BlockType
  title: string
  description: string
  subject_id?: string      // Para bloques study/class
  topic_id?: string        // Para bloques study/travel
  travel_segment?: TravelSegment
  completed: boolean
  priority?: 'low' | 'medium' | 'high' | 'exam'
  manually_edited?: boolean  // Si true: Claude NUNCA lo modifica en un replan
  deleted?: boolean
}
```

---

## 12. Sistema de gym

**Archivo:** `lib/exercises.ts`

### Rotación de tipos

```
empuje → jale → piernas → cardio → movilidad → empuje → ...
```
`getNextWorkoutType(lastWorkouts)` analiza los últimos workouts para determinar el siguiente tipo.

### Adaptación por energía

```typescript
getWorkoutPlan(type, energyLevel, weekNumber, lastPerceivedEffort, studyMode?):
  energyLevel ≤ 2  → movilidad (independiente del tipo)
  energyLevel 3    → maintenance (80% del volumen base)
  energyLevel 4-5  → sesión completa
```

### Ajuste por carga cognitiva *(Feature 6)*

```typescript
// studyMode se calcula desde los próximos academic_events del usuario
// en gym/page.tsx → determineStudyMode(minDaysToEvent)

studyMode === 'exam_prep':
  → fuerza movilidad 20 min sin importar energía ni tipo
  → cognitiveLoadOverride: true
  → banner: "Semana de parciales detectada. Hoy priorizamos recuperación..."

studyMode === 'active_review':
  → si energyLevel ≥ 4: capea a maintenance en lugar de sesión completa
  → banner informativo: "Tenés un parcial próximo..."

studyMode === 'normal' | 'light' | null:
  → comportamiento original por energía
```

El campo `cognitiveLoadOverride: boolean` en el return indica si el plan fue modificado por esta lógica.

### Sobrecarga progresiva

- Incremento: +5% por semana (basado en `weekNumber`)
- Máximo: 1.5× del baseline
- Ajuste por esfuerzo percibido: si fue `'hard'` o `'exhausting'`, reduce el próximo

### Base de ejercicios

- 48 ejercicios locales en `LOCAL_EXERCISES` (sin API externa)
- Clasificados por tipo: empuje, jale, piernas, cardio, movilidad
- Cada ejercicio tiene: nombre, sets, reps, rest_seconds, descripción

---

## 13. Tipos TypeScript principales

```typescript
// ── ACADÉMICO ──────────────────────────────────────────────

type TopicStatus = 'red' | 'yellow' | 'green'

interface Topic {
  id: string; unit_id: string; name: string       // max 4 palabras
  full_description: string; status: TopicStatus
  last_studied: string | null; next_review: string | null
}

type AcademicEventType = 'parcial' | 'parcial_intermedio' | 'entrega_tp' | 'medico' | 'personal'

interface StudyPriorityResult {
  subject_id: string; subject_name: string
  priority: 'low' | 'medium' | 'high' | 'exam'
  priority_score: number; days_to_event: number | null
  event_type: AcademicEventType | null
  weak_topics: Topic[]; recommended_topics: Topic[]
  study_mode: 'exam_prep' | 'active_review' | 'normal' | 'light'
}

// ── CHECK-IN ───────────────────────────────────────────────

interface CheckIn {
  date: string                          // YYYY-MM-DD
  sleep_quality: number                 // 1–5
  energy_level: number                  // 1–5
  stress_level: 'low' | 'medium' | 'high'
  work_mode: 'presencial' | 'remoto' | 'no_work' | 'libre'
  has_faculty: boolean
  faculty_mode: 'presencial' | 'remoto' | null
  faculty_subject: string | null
  travel_route_json: TravelSegment[]
  unexpected_events: string | null
}

interface TravelSegment {
  origin: string; destination: string; duration_minutes: number
}

// ── PLAN ───────────────────────────────────────────────────

type BlockType = 'work' | 'class' | 'study' | 'travel' | 'gym' | 'rest' | 'free'

interface TimeBlock {
  id: string; start_time: string; end_time: string
  type: BlockType; title: string; description: string
  subject_id?: string; topic_id?: string
  travel_segment?: TravelSegment
  completed: boolean
  priority?: 'low' | 'medium' | 'high' | 'exam'
  manually_edited?: boolean; deleted?: boolean
}

// ── NOTIFICACIONES ─────────────────────────────────────────

type NotificationType =
  | 'post_class' | 'energy_boost' | 'exam_alert' | 'early_win'
  | 'exam_approaching' | 'deadline_approaching' | 'exam_today'

interface AppNotification {
  id: string; type: NotificationType
  title: string | null; body: string | null; message: string
  target_path: string | null
  read_status: boolean; triggered_at: string; expires_at: string | null
  context_json: DeadlineAlertContext
  push_sent: boolean; event_id: string | null; subject_id: string | null
  trigger_days_before: number | null   // 14 | 10 | 7 | 5 | 1 | 0
}

// ── GYM ────────────────────────────────────────────────────

type WorkoutType = 'empuje' | 'jale' | 'piernas' | 'cardio' | 'movilidad'

interface Workout {
  type: WorkoutType; duration_minutes: number
  energy_used: number; completed: boolean
  exercises_json: Exercise[]
  perceived_effort?: 'easy' | 'good' | 'hard' | 'exhausting'
}
```

---

## 14. Diseño y UX

### Design tokens (Tailwind extendido)

```
FONDOS
  bg-background   #0A0F1E    (navy oscuro — fondo principal)
  bg-surface      #111827    (charcoal — cards, nav, modales)
  bg-surface-2    #1F2937    (charcoal claro — inputs, items secundarios)

COLORES
  primary         #3B82F6    azul — acciones principales
  cyan            #06B6D4    class blocks, accents
  green           #10B981    gym blocks, temas dominados
  amber           #F59E0B    study blocks, temas en progreso
  red             #EF4444    errores, temas débiles

TEXTO
  text-primary    #F9FAFB
  text-secondary  #9CA3AF
  text-muted      #6B7280

BORDES
  border-subtle   rgba(255,255,255,0.08)

TIPOGRAFÍA
  font-sans       DM Sans (300, 400, 500, 600, 700)
```

### Reglas de UI aplicadas

- Touch targets: `min-h-[44px]` en todos los elementos interactivos (WCAG 2.5.5)
- Bordes redondeados: `rounded-2xl` (1rem) y `rounded-3xl` (1.5rem)
- BottomNav: `aria-label="Navegación principal"` + `aria-current="page"` en ítem activo
- Viewport: `viewport-fit=cover` sin `user-scalable=no` (cumple WCAG 2.5.4)
- Error boundaries con mensaje legible y botón de acción

### Componentes UI

| Componente | Variantes / Props | Comportamiento |
|-----------|-------------------|----------------|
| `Button` | primary, secondary, ghost, danger + `loading` | Spinner durante loading |
| `Card` | default, elevated, gradient | Gradiente para cards destacadas |
| `Badge` | color hex dinámico | Recibe color de materia |
| `TimeBlock` | por `BlockType` | Ícono + color por tipo + toggle completado |
| `TopicPill` | red / yellow / green | Click cicla estados rojo→amarillo→verde |
| `EmojiSelector` | escalas de valores | Energía 1-5, estrés low/med/high |
| `ProgressBar` | animada | % completitud del plan diario |

---

## 15. Estado actual del proyecto

| Área | Estado | Notas |
|------|--------|-------|
| Auth + Onboarding | ✅ Funcional | Magic link + password. Wizard 4 pasos. |
| Check-in diario | ✅ Funcional | 5 pasos. Trabajo omitido si `is_employed=false`. Materia desde DB. |
| Plan IA | ✅ Funcional | Bloques determinísticos garantizados. Claude genera el resto. |
| Replanificación | ✅ Funcional | Ajusta desde hora actual. Preserva completados y editados. |
| Tracker académico | ✅ Funcional | CRUD temas/unidades/eventos. Toggle RGB. |
| Parsing PDF con IA | ✅ Funcional | Sube programa → temas. Sube calendario → fechas. |
| Notificaciones | ✅ Funcional | Motor puro. 7 tipos. Dedup. Push VAPID. |
| Google Calendar | ✅ Funcional | OAuth2 completo. Token refresh automático. |
| Gym tracker | ✅ Funcional | Rotación + sobrecarga progresiva + energía adaptativa + ajuste por carga cognitiva (Feature 6). |
| Estadísticas | ✅ Funcional | Charts recharts. Insight semanal IA. Heatmap de dominio por semana (Feature 5). |
| Detección de Alucinación | ✅ Funcional | Ventana 2h, umbral 3 temas, MCQ con Claude Haiku, reversión a yellow si falla (Feature 4). |
| PWA | ✅ Funcional | SW generado, manifest, instalable. |
| Deploy Vercel | ✅ Live | https://iamentor.vercel.app |
| Tests E2E | ✅ 23/23 | Suite idempotente, 9 pasos. |
| Log de clase | ⚠️ Schema listo | Tabla `class_logs` existe. UI no implementada. |
| Travel logs | ⚠️ Schema listo | Tabla `travel_logs` existe. UI no implementada. |
| Pomodoro | ⚠️ Componente listo | `PomodoroFocus.tsx` existe. No integrado al plan. |
| Vista planes históricos | ❌ Pendiente | Datos en `daily_plans`. Sin UI. |
| Streaming SSE | ❌ Pendiente | Claude responde completo. Sin streaming. |
| Rate limiting IA | ❌ Pendiente | Sin protección ante abuso. |

---

## 16. Limitaciones conocidas y deuda técnica

### Seguridad
- `next@14.2.15` tiene vulnerabilidad conocida. Upgrade a 15.x pendiente.
- Tokens de Google Calendar guardados como texto plano en `user_integrations`. Para multi-usuario a escala, cifrar con AES-256.
- Sin rate limiting en `/api/ai/*` — una llamada maliciosa o bug puede agotar créditos de Anthropic.

### Código
- ESLint desactivado en el build (`ignoreDuringBuilds: true`). ~21 archivos con `no-explicit-any`.
- `next-pwa@5.6.0` usa Workbox 6 (deprecado). Migrar a `@ducanh2912/next-pwa`.
- Sin CI/CD — deploy manual con `vercel --prod`.

### UX
- Sin loading skeletons → pantalla en blanco durante SSR de `today/` y `stats/`.
- Errores de Claude API o Google Calendar son silenciosos para el usuario.
- El wizard de check-in no persiste en localStorage si el usuario cierra accidentalmente.
- Íconos PWA no reales → instalación sin ícono correcto.

### Performance
- Sin caché: cada request genera nuevas llamadas a DB y Claude API.
- Sin Vercel KV ni Redis para cachear planes del día (TTL de 6h sería ideal).

---

## 17. Oportunidades de mejora

Identificadas durante el análisis profundo del proyecto. Ordenadas por impacto potencial:

### Alto impacto — funcionalidades nuevas

| Feature | Descripción | Complejidad |
|---------|-------------|-------------|
| **Streaming SSE del plan** | Elimina la espera de 5s mostrando bloques a medida que Claude los genera | Baja (1-2 días) |
| **Plan pre-generado a las 6 AM** | Vercel Cron Job genera el plan antes de que el usuario despierte | Media |
| **Vista semanal del plan** | Agenda de la semana con bloques de estudio planificados | Media |
| **Registro post-clase desde FAB** | Cargar temas vistos + comprensión directamente desde el botón flotante | Baja |
| **Travel logs con UI** | Registrar qué se estudió en cada segmento de viaje | Baja |
| **Histórico de planes** | Ver planes de días pasados con completion % | Baja |

### Medio impacto — mejoras a funciones existentes

| Feature | Descripción |
|---------|-------------|
| **Drag & drop de bloques** | `@dnd-kit` está instalado. Reordenar bloques manualmente en el plan |
| **Pomodoro integrado al plan** | Al hacer click en un bloque de estudio → inicia Pomodoro + registra sesión en `pomodoro_sessions` |
| **Exportar plan a PDF / .ics** | Compartir el plan del día con tutor o importar a Google Calendar |
| **Múltiples cuatrimestres activos** | El schema lo soporta pero la UI solo muestra uno activo |
| **Exportar progreso académico** | Export CSV de estados de temas (red/yellow/green) por materia |
| **Onboarding adaptable** | Parametrizar la función seed para cualquier carrera, no solo las 4 actuales |

### Bajo impacto — calidad y escalabilidad

| Feature | Descripción |
|---------|-------------|
| Rate limiting con Upstash Redis | 10 requests/hora/usuario en endpoints de IA |
| Modo offline (PWA sync) | Marcar bloques como completados sin conexión y sincronizar al reconectar |
| Multi-usuario institucional | Soporte para facultades/universidades completas |
| API pública | Integración con Moodle/Canvas para importar contenidos automáticamente |

---

## 18. Escalabilidad

### Cuellos de botella actuales

```
1. Claude API: 3-8s latencia por llamada
   → Solución rápida: streaming SSE (muestra bloques a medida que llegan)
   → Solución estructural: generar plan a las 6 AM via Vercel Cron Job

2. Sin caché de plans o priorities
   → Solución: Vercel KV — cachear plan (TTL 6h), priorities (TTL 15min)

3. Sin rate limiting en /api/ai/*
   → Solución: Upstash Redis sliding window (10 req/hora/usuario)

4. Supabase Free: 500MB, 50 conexiones
   → Solución: Supabase Pro ($25/mes) + PgBouncer
```

### Roadmap de escalabilidad

```
ETAPA 1 — 0–1.000 usuarios activos  (~$50/mes)
  ✅ Vercel Hobby o Pro (auto-escala)
  ✅ Supabase Pro ($25/mes) — 8GB, 500 conexiones
  ✅ Rate limiting Upstash Redis ($10/mes)
  ✅ Streaming SSE en /api/ai/plan
  ✅ Agregar índices DB faltantes

ETAPA 2 — 1.000–50.000 usuarios  (~$200/mes)
  + Vercel KV para cachear planes (TTL 6h)
  + Plan pre-generado a las 6 AM (Vercel Cron)
  + Supabase Pro con read replica
  + Sentry (errores) + Vercel Analytics

ETAPA 3 — 50.000+ usuarios  (~$1.000+/mes)
  + Separar servicio de IA (cola BullMQ + workers dedicados)
  + PostgreSQL en Neon con sharding por user_id
  + Multi-tenant: soporte para instituciones educativas
  + CDN Cloudflare para assets estáticos
```

### Features de mayor impacto en retención

| Feature | Impacto | Complejidad |
|---------|---------|-------------|
| Streaming SSE del plan | 🔴 Muy alto — elimina la espera de 5s | Baja |
| Plan pre-generado 6 AM | 🔴 Muy alto — plan listo al despertar | Media |
| Push notifications | 🟡 Alto — recordatorios de check-in y exámenes | Media |
| Modo offline PWA | 🟡 Alto — funciona sin internet | Alta |
| Exportar plan PDF / ics | 🟡 Medio — compartir con tutor/compañeros | Baja |
| Grupos de estudio | 🔵 Bajo — planes compartidos con compañeros | Alta |

---

## 19. Detección de Alucinación de Progreso

> **Problema:** los estudiantes pueden marcar temas como "dominados" demasiado rápido sin haber consolidado el aprendizaje.

### Flujo completo

```
Usuario toca TopicPill → status 'green'
  │
  ├── DB update optimista (status = 'green', last_studied = NOW())
  │
  └── POST /api/topics/complete
        │
        ├── INSERT en topic_completions
        │
        ├── COUNT completaciones sin desafío en ventana de 2 horas
        │     count ≤ 3 → { needs_validation: false }  → fin
        │     count > 3 → generar desafío MCQ ↓
        │
        └── Claude Haiku genera pregunta:
              prompt: topic.name + topic.full_description
              output: { question, options[4], correct_index }
              fallback: self-assessment de 4 niveles
              → guardar challenge en topic_completions (correct_index server-side)
              → return { needs_validation: true, challenge }

Frontend muestra <ProgressHallucinationGuard>
  │
  ├── Usuario selecciona opción y confirma
  │
  └── POST /api/topics/validate
        │
        ├── Recupera correct_index de DB (nunca viaja al cliente)
        ├── Compara selected_index con correct_index
        │
        ├── passed  → { new_status: 'green' }, cierra modal
        └── failed  → UPDATE topics SET status = 'yellow'
                      → UI revierte TopicPill a amarillo
```

### Parámetros de detección

| Parámetro | Valor por defecto |
|-----------|-------------------|
| Ventana temporal | 2 horas |
| Umbral de activación | > 3 temas |
| Modelo para MCQ | `claude-haiku-4-5-20251001` |
| Status al fallar | `'yellow'` (necesita repaso) |
| Acción al omitir | Mantiene `'green'` (beneficio de la duda) |

### Archivos involucrados

| Archivo | Rol |
|---------|-----|
| [app/api/topics/complete/route.ts](app/api/topics/complete/route.ts) | Registro + detección + generación MCQ |
| [app/api/topics/validate/route.ts](app/api/topics/validate/route.ts) | Validación server-side + reversión |
| [components/features/ProgressHallucinationGuard.tsx](components/features/ProgressHallucinationGuard.tsx) | Modal con MCQ + pantalla de resultado |
| [app/(app)/subjects/[id]/SubjectDetailClient.tsx](app/(app)/subjects/[id]/SubjectDetailClient.tsx) | Intercepta `handleTopicStatusChange` cuando `status === 'green'` |
| [supabase/migrations_features456.sql](supabase/migrations_features456.sql) | Tabla `topic_completions` |

### Seguridad del desafío

El campo `challenge_correct_index` **nunca se envía al cliente**. Solo viaja `completion_id + question + options[]`. La validación siempre ocurre server-side comparando `selected_index` con el valor en DB.

---

## 20. Heatmap de Dominio Académico

> **Objetivo:** visualizar el progreso histórico del dominio por materia para motivar al estudiante y detectar materias olvidadas.

### Concepto visual

```
              sem 1   sem 2   sem 3   sem 4   sem 5   sem 6   sem 7   sem 8
Física         ░░░     🟥     🟥      🟧     🟧      🟩      🟩      🟩
Algoritmos     ░░░     🟥     🟧      🟩     🟩      🟩      🟩      🟩
Química ⚠      🟧     🟧      🟧      🟧     🟧      🟧      ░░░     ░░░
Anatomía       🟥     🟥      🟥      🟥     🟥      🟥      🟥      🟥

🟩 ≥ 70%   🟧 40–69%   🟥 1–39%   ░░░ sin datos
⚠ sin actividad en > 7 días
```

### Pipeline de datos

```
1. stats/page.tsx (Server Component)
   → UPSERT progress_snapshots de hoy (fire-and-forget al cargar la página)

2. DomainHeatmap.tsx (Client Component)
   → mount: POST /api/progress/snapshot (idempotente, confirma snapshot)
   → GET /api/progress/snapshot?days=56
   → renderiza CSS-grid con los últimos 8 semanas

3. /api/progress/snapshot GET
   → agrupa snapshots por (subject_id, ISO week)
   → calcula promedio semanal de health_score
   → detecta inactive_subjects (sin mejora en 7 días)
   → retorna { subjects, weeks, labels, grid, inactive_subjects }
```

### Cálculo de `health_score`

```
health_score = green_topics / total_topics   (rango 0.0000–1.0000)
```

Almacenado como `DECIMAL(5,4)` en `progress_snapshots`. Se calcula al momento del upsert desde el estado actual de todos los temas de la materia.

### Semanas con alerta de inactividad

Una materia se marca como inactiva si en los últimos 7 días:
- No tiene ningún snapshot, **o**
- No tiene ninguna mejora de `health_score` entre snapshots consecutivos

Se resalta con `⚠` en rojo junto al nombre de la materia en el heatmap.

### Archivos involucrados

| Archivo | Rol |
|---------|-----|
| [app/api/progress/snapshot/route.ts](app/api/progress/snapshot/route.ts) | POST: upsert diario / GET: grid agregado |
| [components/features/DomainHeatmap.tsx](components/features/DomainHeatmap.tsx) | CSS-grid heatmap auto-fetching |
| [app/(app)/stats/StatsClient.tsx](app/(app)/stats/StatsClient.tsx) | Renderiza `<DomainHeatmap />` |
| [app/(app)/stats/page.tsx](app/(app)/stats/page.tsx) | Upsert server-side al cargar la página |
| [supabase/migrations_features456.sql](supabase/migrations_features456.sql) | Tabla `progress_snapshots` + índice |

---

## 21. Ajuste por Carga Cognitiva

> **Problema:** en semanas de exámenes, el entrenamiento físico intenso compite con la capacidad cognitiva disponible para el estudio.

### Lógica central

```typescript
// gym/page.tsx — Server Component
const upcomingEvents = await supabase
  .from('academic_events')
  .select('type, date')
  .gte('date', today)
  .lte('date', in14Days)

const minDays = min(upcomingEvents.map(ev => daysUntil(ev.date)))
const studyMode = determineStudyMode(minDays)
// 'exam_prep' | 'active_review' | 'normal' | 'light' | null

// GymClient recibe studyMode como prop
// exercises.ts → getWorkoutPlan(..., studyMode)
```

### Tabla de decisión

| `study_mode` | `energyLevel` | Tipo forzado | Duración | Mensaje al usuario |
|---|---|---|---|---|
| `exam_prep` | cualquiera | `movilidad` | 20 min | "Semana de parciales detectada. Hoy priorizamos recuperación..." |
| `active_review` | 4–5 | maintenance (no completo) | 35 min | "Tenés un parcial próximo..." |
| `active_review` | ≤ 3 | sin cambio | según energía | — |
| `normal` / `light` | cualquiera | sin cambio | según energía | — |

### Campo `cognitiveLoadOverride`

`getWorkoutPlan()` ahora retorna `cognitiveLoadOverride: boolean`. Es `true` cuando el plan fue alterado por `study_mode`. Puede usarse para mostrar un indicador visual o loguear el evento.

### Reutilización de `study_mode`

El mismo campo `study_mode` de `StudyPriorityResult` (generado por `lib/study-priority.ts → determineStudyMode()`) se usa en:

- `api/ai/plan`: instruye a Claude a generar bloques de estudio en modo examen
- `gym/page.tsx`: detecta si hay parciales próximos para ajustar el entrenamiento
- `GymClient.tsx`: muestra el banner contextual

Esto garantiza coherencia: el sistema siempre tiene una única fuente de verdad para el nivel de urgencia académica.

### Archivos involucrados

| Archivo | Rol |
|---------|-----|
| [lib/exercises.ts](lib/exercises.ts) | `getWorkoutPlan(..., studyMode?)` — lógica de override |
| [app/(app)/gym/page.tsx](app/(app)/gym/page.tsx) | Fetcha eventos, calcula `studyMode`, pasa a GymClient |
| [app/(app)/gym/GymClient.tsx](app/(app)/gym/GymClient.tsx) | Acepta `studyMode`, pasa a `getWorkoutPlan`, renderiza banner |
| [lib/study-priority.ts](lib/study-priority.ts) | `determineStudyMode(days)` — función reutilizada |
