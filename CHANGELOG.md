# IAmentor — Registro de Cambios

---

## [2026-03-21 #9] — Auditoría técnica: bugs, refactors y limpieza de código

**Fecha / Hora:** 2026-03-21, noche
**MCP / Skills:** ux-pwa
**Secciones:** Seguridad, Bugs, Performance, UX, Código muerto

### Archivos modificados
- `middleware.ts`
- `lib/rate-limit.ts`
- `lib/utils.ts`
- `lib/constants.ts` *(nuevo)*
- `lib/toast-context.tsx` *(nuevo)*
- `app/api/notifications/route.ts`
- `app/api/cron/generate-plans/route.ts`
- `app/api/topics/complete/route.ts`
- `app/api/ai/plan/route.ts`
- `app/(app)/layout.tsx`
- `app/(app)/grades/GradesClient.tsx`
- `app/(app)/today/TodayClient.tsx`
- `app/(app)/subjects/[id]/SubjectDetailClient.tsx`
- `components/features/FabMenu.tsx`
- `components/layout/OfflineIndicator.tsx`
- `lib/study-priority.ts`
- `types/index.ts`
- `CLAUDE.md`
- *(eliminados)* `app/api/resources/route.ts`, `app/api/resources/[id]/route.ts`

### Cambios técnicos
- **BUG-01:** Ruta `/grades` agregada al middleware — ya requiere autenticación
- **BUG-02:** Endpoint `weekly-plan` agregado al rate limiter de Upstash — ya tiene límite de 3/día
- **BUG-03:** Motor de notificaciones usa `getTodayArg()` y `getDowArg()` — corrige drift de timezone UTC vs UTC-3
- **BUG-04:** Cron usa `.upsert({ ignoreDuplicates: true })` en lugar de `.insert()` — elimina race condition
- **BUG-05:** SM-2 `next_review` se calcula con fecha Argentina (`getTodayArg()`) — corrige adelantamiento de 1 día
- **BUG-06:** `ImprevistoModal` tiene estado `error` y catch con feedback — ya no es silencioso
- **BUG-07 + UX-04 + INC-03:** Score validado en rango `0–10`; eventos `medico`/`personal` filtrados del selector de calificaciones; `gradeType` tipado correctamente como `GradeType`
- **INC-01:** CLAUDE.md actualizado: Next.js 15.4.11
- **INC-06:** `classLogs` tipado como `ClassLog[]` en `SubjectDetailClient` (antes era `any[]`)
- **TECH-01:** Creado `lib/constants.ts` con `EVENT_TYPE_LABELS` y `GRADEABLE_EVENT_TYPES` — centraliza el mapeo duplicado en 4 archivos
- **TECH-02:** `parseEventNotes()` extraído a `lib/utils.ts` — ya no está duplicado en `TodayClient` y `SubjectDetailClient`
- **TECH-03:** Queries del plan de IA refactorizadas a 2 fases paralelas con `Promise.all` — 8 queries antes secuenciales ahora corren en paralelo
- **NEW-01:** Sistema de Toast global (`lib/toast-context.tsx`) — `ToastProvider` en el layout, `useToast()` en `GradesClient` para feedback de guardar/eliminar
- **NEW-04:** Cron envía webhook a `CRON_ERROR_WEBHOOK_URL` cuando hay errores de generación
- **DEAD-01:** Eliminados `app/api/resources/` (endpoint sin consumidor en el UI)
- **DEAD-02/03/04:** Eliminados tipos sin uso: `TravelLog`, `ExerciseFromAPI`, `WorkoutWeek`, `WorkoutDay`, `SubjectResource`

### Cambios en UX
- Replan muestra mensaje de error cuando falla (antes silencioso)
- Calificaciones: solo aparecen tipos de evento calificables (parcial, TP, recuperatorio) en el selector
- Calificaciones: toast de éxito al guardar, toast de error si falla
- `OfflineIndicator`: corregido typo "sincronizara" → "sincronizará"

### Cambios visuales
- Nuevo sistema de toasts en esquina inferior (aparece en acciones de calificaciones)

---

## [2026-03-21 #8] — Docs: README, SETUP y CHANGELOG actualizados

**Fecha / Hora:** 2026-03-21, noche
**MCP / Skills:** —
**Secciones:** Documentación

### Archivos modificados
- `README.md`
- `SETUP.md`
- `CHANGELOG.md`

### Cambios técnicos
- `README.md`: actualizada tabla de features (Calificaciones → página propia + nota en cards de eventos); agregada ruta `/grades` al diagrama de arquitectura y a la estructura de archivos; removida mención de recursos en la tabla de features
- `SETUP.md`: agregado `migration_resources.sql` en la tabla de migraciones y en la lista de archivos de configuración; actualizado el `SELECT` de verificación para incluir `subject_resources`; agregada sección **16.3 Registrar una Calificación** con el flujo paso a paso; actualizado el checklist final; renombrada sección anterior como 16.4

---

## [2026-03-21 #7] — Calificaciones: solo materias activas, cualquier fecha, nota en cards

**Fecha / Hora:** 2026-03-21, noche
**MCP / Skills:** —
**Secciones:** Calificaciones, Materias — Fechas importantes

### Archivos modificados
- `app/(app)/grades/page.tsx`
- `app/(app)/grades/GradesClient.tsx`
- `app/(app)/subjects/[id]/page.tsx`
- `app/(app)/subjects/[id]/SubjectDetailClient.tsx`

### Cambios técnicos
- `grades/page.tsx`: subjects filtradas por semester activo; eventos sin filtro de tipo ni fecha
- `GradesClient`: eventos ya calificados se muestran con su nota (permite editar); al elegir uno pre-carga el score; `handleSave` detecta grade existente y hace PATCH en vez de POST
- `subjects/[id]/page.tsx`: re-agrega fetch de grades (solo `id, event_id, score, max_score`)
- `SubjectDetailClient`: muestra score de nota en la card del evento (reemplaza badge de días cuando ya hay calificación)

### Cambios en UX
- La página de Calificaciones solo muestra materias del cuatrimestre activo
- Se puede seleccionar cualquier fecha importante (futuras o pasadas) para asignarle una nota
- Si una fecha ya tiene nota, se puede editar desde el picker
- En detalle de materia, las cards de fechas importantes muestran la nota en color (verde/amarillo/rojo) cuando está cargada

---

## [2026-03-21 #6] — Nueva página de Calificaciones en menú lateral

**Fecha / Hora:** 2026-03-21, noche
**MCP / Skills:** —
**Secciones:** Calificaciones (nueva página), Materias, Navegación

### Archivos modificados
- `app/(app)/grades/page.tsx` (nuevo)
- `app/(app)/grades/GradesClient.tsx` (nuevo)
- `components/layout/SideDrawer.tsx`
- `app/(app)/subjects/[id]/SubjectDetailClient.tsx`
- `app/(app)/subjects/[id]/page.tsx`

### Cambios técnicos
- Nueva ruta `/grades` con server component que carga todas las notas, materias y eventos pasados del usuario
- `GradesClient` con flujo de 3 pasos en modal: elegir materia → elegir examen → ingresar nota
- Lógica de recuperatorio (score < 4) que crea evento académico en Supabase
- Eliminados de `SubjectDetailClient`: state de grades/review, `handleDeleteGrade`, `handleSaveReview`, `pastGradeableEvts`, sección Calificaciones y ambos modales
- Eliminada query de grades del server component de detalle de materia

### Cambios en UX
- Calificaciones ahora vive en su propia sección del menú lateral ("Calificaciones" bajo "Estudio")
- Vista agrupa las notas por materia con dot de color
- Flujo guiado por pasos evita formularios vacíos
- Detalle de materia queda más limpio, enfocado en temas y progreso

### Cambios visuales
- Nuevo ítem "Calificaciones" en el SideDrawer con ícono de lápiz
- Página de calificaciones con empty state ilustrado y botón de acción
- Lista agrupada por materia con scores coloreados (verde/amarillo/rojo)

---

## [2026-03-21 #5] — Simplificación de calificaciones + eliminación de recursos

**Fecha / Hora:** 2026-03-21, noche
**MCP / Skills:** —
**Secciones:** Materias — Calificaciones, Recursos

### Archivos modificados
- `app/(app)/subjects/[id]/SubjectDetailClient.tsx`
- `types/index.ts`

### Cambios técnicos
- Eliminada la sección "Recursos" (links por materia) del UI del detalle de materia; estado, funciones y render completos removidos
- Eliminado el formulario manual de calificaciones (`showGradeForm`, `gradeFormData`, `handleSaveGrade`)
- Simplificado el modal de review post-parcial: de 3 pasos a pantalla única con sección condicional de recuperatorio
- Nuevo estado `reviewRecoveryDate` y `gradePickerOpen`
- Nuevo flujo: si la nota es < 4 se muestra inline una sección roja para ingresar la fecha del recuperatorio (opcional); si se ingresa, se crea automáticamente un `academic_event` de tipo `recuperatorio` vía Supabase
- Nuevo modal "Agregar calificación" (grade picker): muestra todos los eventos gradeable del pasado sin nota registrada para seleccionar
- Añadido `'recuperatorio'` al tipo `AcademicEventType` y al array `GRADEABLE_TYPES`

### Cambios en UX
- El usuario ya no puede cargar calificaciones manualmente (sin evento asociado); todo parte de seleccionar una fecha importante existente
- La sección de Recursos desaparece del UI (menos fricción, menos ruido)
- Al registrar una nota desaprobatoria (<4/10), aparece una caja roja inline que pregunta la fecha del recuperatorio; si se completa, el evento se crea automáticamente en la agenda

### Cambios visuales
- Desaparece el bloque "Recursos" del detalle de materia
- El botón "+" de Calificaciones ahora abre un modal con lista de eventos seleccionables en vez de un formulario de texto
- El modal de resultado es más compacto: un input de nota + sección condicional de recuperatorio

---

## [2026-03-21 #4] — A7, R3, TS fixes, B7, ClassLogModal, recursos por materia, plan semanal, Next.js 15

**Fecha / Hora:** 2026-03-21, noche
**MCP / Skills:** —
**Secciones:** Onboarding, API/AI, TypeScript, Materias, Agenda/Semanal, Infraestructura

### Archivos modificados
- `app/onboarding/OnboardingClient.tsx`
- `app/api/ai/parse-syllabus/route.ts`
- `app/api/ai/parse-events/route.ts`
- `app/(app)/cursada/page.tsx`
- `app/(app)/gym/GymClient.tsx`
- `app/(app)/today/TodayClient.tsx`
- `hooks/usePushNotifications.ts`
- `lib/study-priority.ts`
- `lib/rate-limit.ts`
- `app/(app)/calendar/page.tsx`
- `app/(app)/subjects/[id]/SubjectDetailClient.tsx`
- `app/(app)/subjects/[id]/page.tsx`
- `components/features/ClassLogModal.tsx` _(nuevo)_
- `types/index.ts`
- `supabase/migration_resources.sql` _(nuevo)_
- `app/api/resources/route.ts` _(nuevo)_
- `app/api/resources/[id]/route.ts` _(nuevo)_
- `app/api/ai/weekly-plan/route.ts` _(nuevo)_
- `app/(app)/weekly/page.tsx` _(nuevo)_
- `app/(app)/weekly/WeeklyClient.tsx` _(nuevo)_
- `components/layout/AppShell.tsx`
- `components/layout/SideDrawer.tsx`
- `app/api/grades/[id]/route.ts`
- `app/api/notifications/[id]/route.ts`
- `middleware.ts`
- `package.json`
- `next.config.js`
- `lib/supabase-server.ts`

### Cambios técnicos

**A7 — Fix onboarding skip cuatrimestre:**
- `saveSubjectsAndAdvance` crea el semestre inline si `semesterId` es null (edge case: recarga de página en paso intermedio)

**R3 — Validación tamaño de archivos:**
- `/api/ai/parse-syllabus` y `/api/ai/parse-events`: rechazan archivos > 10 MB con HTTP 413

**TypeScript — 9 errores pre-existentes corregidos:**
- `cursada/page.tsx`: `Array.from(new Set(...))` en lugar de spread
- `GymClient.tsx`: mismo fix para streak calculation
- `TodayClient.tsx`: `Array.from(map.values())`, regex `[\s\S]` en vez de flag `s`, cast `AcademicEventType`
- `usePushNotifications.ts`: `urlBase64ToUint8Array` retorna `ArrayBuffer` usando for-loop
- `lib/study-priority.ts`: pre-filtro de tipos de evento + cast `Record<string, number>`
- `calendar/page.tsx`: cast `events as any` (Supabase join array vs objeto)
- `lib/rate-limit.ts`: `@ts-ignore` en dynamic imports opcionales de Upstash

**B7 — Descripción/notas de temas:**
- Botón "Descripción / notas" en menú contextual de cada tema
- Modal con textarea para editar `full_description`, persiste en `topics.full_description`

**ClassLogModal — Extracción de componente:**
- `components/features/ClassLogModal.tsx`: modal de registro post-clase extraído de SubjectDetailClient (~280 líneas)
- Interfaz `ClassLogFormData` exportada desde el componente

**6.3 — Recursos por materia:**
- Nueva tabla `subject_resources` (migration SQL)
- `GET/POST /api/resources`, `DELETE /api/resources/[id]`
- UI en SubjectDetail: chips de recursos con link, formulario inline para agregar (título + URL), carga lazy al expandir la sección
- Nuevo tipo `SubjectResource` en `types/index.ts`

**B6 — Planificador semanal:**
- `POST /api/ai/weekly-plan`: genera plan de 7 días con metas de estudio, horas, prioridades y tip diario vía Claude
- `/weekly` page + `WeeklyClient`: UI con botón generar, skeletons, banner de materia prioritaria, strip de stats (horas totales, días activos, sesiones), DayCards colapsables
- Agregado a sidebar y AppShell titles

**B2 — Upgrade Next.js 14.2.15 → 15.4.11:**
- `next` y `eslint-config-next` actualizados a 15.4.11 (evita CVE-2025-66478 de 15.3.4)
- `next-pwa` reemplazado por `@ducanh2912/next-pwa` (fork mantenido para Next.js 15)
- `next.config.js`: `require('@ducanh2912/next-pwa').default({...})`
- `lib/supabase-server.ts`: cookies lazy con `await cookies()` dentro de closures `getAll`/`setAll`
- 4 rutas dinámicas migradas a `params: Promise<{ id: string }>` con `await params`
- `middleware.ts`: agregadas rutas `/weekly` y `/notifications` a `isAppRoute`

### Cambios en UX
- Onboarding: ya no se bloquea en el paso de materias al refrescar la página
- Materias: nuevo campo de notas por tema, sección de recursos con links directos, registro de clase extraído en modal reutilizable
- Plan semanal: nueva pantalla `/weekly` con planificación de 7 días generada por IA

### Cambios visuales
- `/weekly`: banner con materia prioritaria, stats horizontales, cards diarios colapsables con metas de estudio
- Sidebar: nuevo ítem "Plan semanal" en sección Agenda

---

## [2026-03-21 #3] — Features innovadoras: flashcards de viaje, plan provisional, readiness score, calificaciones

**Fecha / Hora:** 2026-03-21, noche
**MCP / Skills:** —
**Secciones:** Today, Materias/SubjectDetail, API, DB, Tipos

### Archivos modificados
- `types/index.ts`
- `supabase/migration_grades.sql` _(nuevo)_
- `app/api/grades/route.ts` _(nuevo)_
- `app/api/grades/[id]/route.ts` _(nuevo)_
- `components/features/TravelFlashcard.tsx` _(nuevo)_
- `app/(app)/today/TodayClient.tsx`
- `app/(app)/subjects/[id]/page.tsx`
- `app/(app)/subjects/[id]/SubjectDetailClient.tsx`

### Cambios técnicos

**7.1 — Modo viaje inteligente (flashcards swipeables):**
- Nuevo `components/features/TravelFlashcard.tsx`: overlay fullscreen con pills del `micro_review` presentadas como tarjetas swipeables (táctil y botones)
- Dots de progreso, navegación anterior/siguiente, self-eval "¿Cuánto retuviste? 1-5" en el último paso
- Rating persiste en `localStorage` con clave `travel_rating_{blockTitle}_{date}`
- Botón de flashcard (ícono naipes, amber) aparece en bloques de viaje con `micro_review` en el timeline de Today

**7.2 — Plan provisional sin check-in:**
- Banner informativo "Plan provisional · Hacé el check-in para personalizarlo" en Today cuando hay bloques pero no hay check-in del día
- El plan generado por el cron de 6AM ya se mostraba como previewBlocks; el banner contextualiza el estado para el usuario

**7.4 — Score de readiness pre-parcial:**
- `readinessScore` calculado en `SubjectDetailClient` para el evento más cercano dentro de 14 días
- Fórmula: greenPct × 0.7 pts + yellowPct × 0.15 pts + activityBonus (class logs últimos 14d) × 0.15 pts = 0–100
- Card con barra de progreso y color verde/amber/rojo según umbral (70 / 45 / <45)
- Solo se muestra cuando hay un parcial/TP dentro de 14 días

**7.5 — Calificaciones + Post-parcial review:**
- Nuevo tipo `Grade` y `GradeType` en `types/index.ts`
- Nueva tabla `grades` con RLS (migration_grades.sql): subject_id, event_id?, title, grade_type, score, max_score, notes, exam_date
- API REST completa: `GET /api/grades?subject_id=`, `POST /api/grades`, `PATCH /api/grades/[id]`, `DELETE /api/grades/[id]`
- Sección "Calificaciones" en SubjectDetailClient: lista de notas con color (verde ≥60%, amber ≥40%, rojo <40%), formulario de carga, eliminación individual
- CTA "¿Cómo te fue?" aparece automáticamente para parciales/TPs pasados sin nota registrada
- Modal "Post-parcial review" de 3 pasos: nota obtenida → temas flojos (selección) → confirmación; guarda como `Grade` con notes de temas flojos
- `page.tsx` del subject: query de `grades` pasada como prop inicial

### Cambios en UX
- Bloques de viaje con contenido de micro_review ahora tienen un botón de flashcards — el repaso del viaje es interactivo en lugar de texto plano
- Al llegar a casa después del viaje, el usuario puede auto-evaluarse y ver si retuvo los conceptos
- Sin check-in, el plan provisional muestra un banner claro en lugar de solo mostrar bloques en modo preview
- Al entrar a una materia con un parcial próximo (≤14 días), se ve inmediatamente el índice de preparación
- Los parciales y TPs pasados disparan automáticamente un CTA para registrar la nota — cierra el loop del ciclo de estudio
- El historial de calificaciones es visible por materia con colores semáforo

### Cambios visuales
- Nueva card verde/amber/rojo de "Índice de preparación" arriba de "Fechas importantes" cuando hay evento próximo
- Nueva sección "Calificaciones" al final de la pantalla de materia, debajo del historial de clases
- Chips amber de CTA post-parcial con botón "Registrar"
- Modal de 3 pasos para post-parcial review
- Overlay fullscreen de flashcards para bloques de viaje

### Notas de setup requeridas
- **DB**: ejecutar `supabase/migration_grades.sql` en el SQL editor de Supabase para crear la tabla `grades`

---

## [2026-03-21 #2] — Nuevas funcionalidades: offline mode, spaced repetition, free study timer, PWA shortcuts

**Fecha / Hora:** 2026-03-21, noche
**MCP / Skills:** —
**Secciones:** PWA, Materias/Topics, FAB, Layout

### Archivos modificados
- `public/manifest.json`
- `public/sw.js` _(sin cambios — generado por next-pwa)_
- `lib/offline-queue.ts` _(nuevo)_
- `components/layout/OfflineIndicator.tsx` _(nuevo)_
- `app/(app)/layout.tsx`
- `app/api/topics/complete/route.ts`
- `app/api/topics/validate/route.ts`
- `app/(app)/subjects/[id]/SubjectDetailClient.tsx`
- `components/features/FabMenu.tsx`
- `components/features/PomodoroFocus.tsx`

### Cambios técnicos

**6.7 — PWA Shortcuts:**
- `manifest.json`: agrega campo `shortcuts` con 4 acciones nativas — "Ver plan de hoy", "Mis materias", "Agenda", "Hacer check-in"
- En Android (PWA instalada), aparecen al mantener presionado el ícono de la app

**6.4 — Spaced repetition SM-2 lite:**
- `/api/topics/complete`: antes de insertar la completion, cuenta las previas del topic y calcula `next_review` con intervalos SM-2 lite (1/3/7/14/30 días)
- Actualiza `next_review` en la tabla `topics` de forma non-blocking
- `/api/topics/validate`: si el challenge falla, limpia `next_review` (fuerza re-estudio antes de próxima revisión)
- `SubjectDetailClient`: calcula `reviewDueCount` (temas verdes con `next_review <= hoy`) y lo muestra como chip amber "N para repasar" en la barra de progreso del header

**6.5 — Timer de estudio libre:**
- `FabMenu`: nuevo tipo `Modal = 'estudio'`, interfaz `FreeStudySession`, estado `freeStudy`
- Nuevo `EstudioModal`: selector de materia + tema (optgroup por unidad) con botón "Iniciar Pomodoro"
- Al iniciar: el modal cierra y `PomodoroFocus` toma pantalla completa con `blockId=null`
- `PomodoroFocus`: `blockId` ahora es `string | null` (opcional); guarda `block_id: null` en `pomodoro_sessions`
- Nueva opción en el menú FAB: "Estudio libre" con ícono reloj, color violet

**6.2 — Modo offline:**
- `lib/offline-queue.ts`: utilidad localStorage para cola de mutaciones; `enqueueOperation`, `fetchOrQueue`, `processQueue`, `getPendingCount`
- `components/layout/OfflineIndicator.tsx`: banner top de pantalla con 3 estados — offline (amber, muestra pendientes), sincronizando (azul, spinner), sincronizado (verde, 3 seg)
- `app/(app)/layout.tsx`: incluye `<OfflineIndicator />` globalmente

### Cambios en UX

- En SubjectDetailClient, la barra de progreso ahora muestra cuántos temas verdes tienen revisión pendiente según SM-2
- Al marcar un tema como verde, su próxima revisión queda programada automáticamente (sin acción del usuario)
- Desde el FAB se puede iniciar un Pomodoro de estudio libre sin necesidad de tener un plan activo del día
- Al perder conexión, aparece un banner informando del modo offline y cuántos cambios quedan pendientes
- Al reconectarse, la cola se procesa automáticamente y confirma los cambios sincronizados
- En Android (PWA instalada), mantener presionado el ícono muestra accesos directos a Hoy, Materias, Agenda y Check-in

### Cambios visuales

- Header de materia: chip amber "N para repasar" junto a los contadores rojo/amarillo/verde
- FAB menu: nueva opción "Estudio libre" con icono de reloj y badge violet
- Banner offline fijo en el top de la pantalla cuando no hay conexión

---

## [2026-03-21 #1] — Mejoras UX/UI y técnicas (secciones 3 y 4 de mejoras.md)

**Fecha / Hora:** 2026-03-21, tarde
**MCP / Skills:** —
**Secciones:** Today, Stats, Gym, SubjectDetail, Notificaciones, API AI, Cron, Tipos

### Archivos modificados
- `app/(app)/today/TodayClient.tsx`
- `app/(app)/stats/StatsClient.tsx`
- `app/(app)/stats/page.tsx`
- `app/(app)/stats/loading.tsx` _(nuevo)_
- `app/(app)/subjects/loading.tsx` _(nuevo)_
- `app/(app)/subjects/[id]/loading.tsx` _(nuevo)_
- `app/(app)/agenda/loading.tsx` _(nuevo)_
- `app/(app)/gym/GymClient.tsx`
- `app/(app)/subjects/[id]/SubjectDetailClient.tsx`
- `app/api/ai/plan/route.ts`
- `app/api/ai/replan/route.ts`
- `app/api/ai/parse-syllabus/route.ts`
- `app/api/ai/parse-events/route.ts`
- `app/api/ai/weekly-insight/route.ts`
- `app/api/cron/generate-plans/route.ts` _(nuevo)_
- `lib/rate-limit.ts` _(nuevo)_
- `components/features/SyllabusImport.tsx` _(nuevo)_
- `components/features/EventsImport.tsx` _(nuevo)_
- `types/index.ts`
- `vercel.json` _(nuevo)_

### Cambios técnicos

**3.7 — Empty state mejorado en Today sin check-in:**
- Reemplazó el compact strip por una card más informativa con botón prominente y descripción del valor del check-in

**3.8 — Gráfico correlación energía / completión en Stats:**
- `stats/page.tsx`: agrega queries de `checkins` y `daily_plans` para los últimos 30 días
- `StatsClient.tsx`: nuevo prop `correlationData`; renderiza `LineChart` de Recharts con dos líneas (energía % y completión %)
- Muestra mensaje educativo cuando hay menos de 3 puntos de datos

**3.9 — Micro-animación al marcar bloque completo:**
- Estado `justCompleted: Set<string>` en TodayClient; se agrega el id por 600ms al completar un bloque
- El dot de completión hace scale-125 + fondo verde sólido durante la animación

**4.1 — Rate limiting con Upstash Redis:**
- Nuevo `lib/rate-limit.ts`: helper con lazy import de `@upstash/ratelimit` y `@upstash/redis`; fallback graceful si las env vars no están configuradas
- Límites: plan → 10/día, replan → 5/día, parse-syllabus → 3/día, parse-events → 5/día, weekly-insight → 3/día
- Aplicado a los 5 endpoints de `/api/ai/*`; retorna 429 con headers estándar

**4.3 — Eliminación de `any` explícitos:**
- `TodayClient`: `upcomingEvents: AcademicEvent[]` con tipo extendido `AcademicEventWithSubject`
- `StatsClient`: tipos locales `WorkoutItem` y `SubjectProgressItem` reemplazan `any[]`
- `GymClient`: `recentWorkouts: Workout[]`, `todayWorkout: Workout | null`
- `Workout` en `types/index.ts`: agrega `perceived_effort?: string | null`

**4.4 — Fix weekNumber en Gym:**
- Reemplaza `Math.ceil(recentWorkouts.length / 5)` con conteo de semanas ISO calendario reales que tuvieron al menos un entrenamiento completado
- Fix adicional en `calculateStreak`: usa set de fechas únicas; diff exacta de 1 día (no `<= 1`)

**4.6 — Descomposición SubjectDetailClient:**
- Extrae `components/features/SyllabusImport.tsx`: maneja su propio estado de archivo/parsing/resultado
- Extrae `components/features/EventsImport.tsx`: idem para importación de fechas; emite callback `onImported(events)`
- SubjectDetailClient elimina ~60 líneas de estado y funciones inline; las reemplaza con los nuevos componentes

**4.7 — Error boundary en Today:**
- Estado `planError` visible cuando el stream falla o devuelve 429
- Card de error con mensaje descriptivo y botón "Reintentar"
- Manejo explícito de 429 (rate limit) con mensaje en español

**4.9 — Cron pre-generación plan provisional:**
- Nuevo endpoint `app/api/cron/generate-plans/route.ts`
- `vercel.json` con schedule `0 9 * * *` (6AM UTC-3)
- Genera planes usando el último check-in del usuario como baseline; skip usuarios que ya tienen plan del día
- Autenticado con `CRON_SECRET`; requiere `SUPABASE_SERVICE_ROLE_KEY`

**4.10 — Loading skeletons:**
- `loading.tsx` para Stats, Subjects, Agenda y SubjectDetail
- Skeletons de pulso que reflejan la estructura real de cada página

### Cambios en UX
- Today: CTA de check-in es una card destacada con botón principal azul (antes era un strip compacto)
- Today: errores de generación se muestran con mensaje claro y opción de reintentar
- Stats: nuevo gráfico de dos líneas (energía vs completión) — el insight más valioso de la app
- Gym: semana número es ahora un dato real (semanas calendario)
- Carga: las páginas SSR muestran skeletons animados en lugar del spinner genérico

### Notas de setup requeridas
- **Rate limiting (4.1)**: ejecutar `npm install @upstash/ratelimit @upstash/redis` y configurar `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` en Vercel
- **Cron (4.9)**: agregar `CRON_SECRET` y `SUPABASE_SERVICE_ROLE_KEY` en variables de entorno de Vercel

### Pendiente de esta sesión
- **4.2** (Next.js 15 upgrade): requiere sesión dedicada — breaking changes en async `cookies()`/`headers()`/`params` afectan ~20 archivos
- **4.6** incompleto: `ClassLogModal` y `UnitSection` siguen inline en SubjectDetailClient (estado muy acoplado)

---

## [2026-03-20 #7] — Mejoras integrales UX, bugs y funcionalidades

**Fecha / Hora:** 2026-03-20, noche
**MCP / Skills:** —
**Secciones:** Onboarding, SubjectDetail, AppShell, Today, Stats, Notifications, Settings, Agenda

### Archivos modificados
- `app/onboarding/OnboardingClient.tsx`
- `app/(app)/subjects/[id]/SubjectDetailClient.tsx`
- `app/(app)/layout.tsx`
- `components/layout/AppShell.tsx`
- `app/(app)/today/TodayClient.tsx`
- `app/(app)/stats/StatsClient.tsx`
- `app/(app)/stats/page.tsx`
- `app/(app)/notifications/page.tsx`
- `app/api/notifications/[id]/route.ts`
- `app/(app)/settings/page.tsx`
- `app/(app)/agenda/AgendaClient.tsx`

### Cambios técnicos
- **Onboarding:** validación `start_date < end_date` con error inline en rojo; inputs marcados con borde rojo al detectar fechas invertidas
- **SubjectDetail:** temas expandidos por defecto (`collapsedUnits` arranca en `false`); buscador de temas con filtro en tiempo real y expansión automática; botones arriba/abajo para reordenar unidades con persistencia en DB; función `reorderUnit()` que hace swap de `order_index` y persiste ambas filas
- **AppShell + layout:** `notificationUnreadCount` ya no está hardcodeado en 0 — se consulta la DB en el Server Component del layout y se pasa como prop
- **TodayClient:** eliminado `setBlocks([])` en `generatePlan()` para evitar el flash de estado vacío al regenerar; `GRID_START` bajado de 6 a 5 para mostrar bloques desde las 5AM
- **StatsClient:** simplificado drásticamente — eliminados KPIs de energía/sueño/completión, gráfico de energía por día, gráfico de cumplimiento del plan, DomainHeatmap y AI insight; queda solo progreso académico y entrenamientos
- **StatsPage:** agrega filtro `.is('deleted_at', null)` para excluir materias eliminadas del progreso académico; eliminadas consultas de checkins, plans, travelLogs que ya no se usan
- **Notifications:** eliminación individual (botón por notificación) y eliminación de todas las leídas ("Borrar leídas"); filtrado de notificaciones expiradas usando `expires_at`; endpoint `DELETE /api/notifications/[id]` implementado
- **Settings:** agregadas cards de acceso rápido a `/cuatrimestres`, `/cursada` y `/trabajo` con descripción e ícono de flecha
- **Agenda:** vista semanal con toggle "Lista / Semana"; navegación por semanas (anterior / siguiente / volver a hoy); eventos ubicados en el día correspondiente; días del período destacados si tienen eventos

### Cambios en UX
- Los temas de una materia se ven inmediatamente al entrar, sin necesidad de expandir cada unidad
- Se puede buscar un tema específico escribiendo en el buscador del Temario
- Las unidades se pueden reordenar con flechas arriba/abajo
- El badge de notificaciones en el menú ahora refleja el conteo real de no leídas
- Al regenerar el plan en Today no hay flash de pantalla vacía
- Bloques que empiezan antes de las 6AM son visibles en la grilla
- Stats es más simple y directa: solo muestra lo académico y los entrenamientos
- Las materias eliminadas ya no aparecen en el progreso de Stats
- En Notificaciones se puede eliminar alertas individuales y borrar en lote las ya leídas; las expiradas se ocultan automáticamente
- Desde Configuración se puede navegar directamente a Cuatrimestres, Cursada y Trabajo
- En Agenda hay una nueva vista semanal para ver qué eventos caen en cada día de la semana

---

## [2026-03-20 #6] — Banner de evento importante: check post-evento y dismiss

**Fecha / Hora:** 2026-03-20, noche
**MCP / Skills:** —
**Secciones:** Today — banner de fecha importante

### Archivos modificados
- `app/(app)/today/TodayClient.tsx`

### Cambios técnicos
- Se parsea el campo `time` del JSON de `notes` del evento importante del día
- Se calcula si ya pasaron 3 horas desde la hora del evento (comparación client-side con `now`)
- Estado `bannerDismissed` y `eventCheckedStatus` (`'si' | 'no' | null`) persistidos en `localStorage` con clave `banner_dismissed_{id}_{date}` y `event_checked_{id}_{date}`
- Se carga el estado guardado en `useEffect` al montar el componente

### Cambios en UX
- **Evento con hora cargada**: 3h después de la hora del evento, el banner amber se transforma en un prompt verde "¿Ya realizaste el [tipo]?" con botones "Sí, lo hice" / "No todavía". Si el usuario confirma con "Sí", el banner cambia a estado "completado" (verde con checkmark). Persiste entre recargas
- **Evento sin hora cargada**: Se muestra una X en el banner para que el usuario pueda quitarlo de la vista. Persiste entre recargas hasta el día siguiente

### Cambios visuales
- Banner dismissable con botón X (ámbar/sutil) cuando el evento no tiene horario
- Banner verde de confirmación post-evento con dos botones de acción
- Banner verde minimal con checkmark cuando el evento fue confirmado como completado
- La hora del evento (si existe) se muestra sutilmente en el banner normal: `· HH:MM`

---

## [2026-03-20 #5] — Temario: acordeones reales por unidad

**Fecha / Hora:** 2026-03-20, noche
**MCP / Skills:** —
**Secciones:** Detalle de materia — sección Temario

### Archivos modificados
- `app/(app)/subjects/[id]/SubjectDetailClient.tsx`

### Cambios técnicos
- Estado inicial de `collapsedUnits` cambiado: todas las unidades arrancan colapsadas (`true`) en lugar de depender del conteo de temas
- `isCollapsed` default cambiado de `?? false` a `?? true`
- `visibleTopics` eliminado: cuando colapsado no se muestra nada, cuando expandido se muestran todos
- El input de "Agregar tema" movido dentro del bloque expandido; al presionar "+ Tema" también auto-expande la unidad
- Hint text de "N temas más" eliminado

### Cambios en UX
- Temario arranca con todas las unidades cerradas — se ve solo la lista de acordeones
- Al tocar una unidad se expanden todos sus temas (no hay preview de 4)
- El borde del acordeón cambia a `border-primary/20` y el fondo a `bg-primary/5` cuando está expandido (feedback visual de estado)
- Los contadores en el header muestran dots de color (verde/amarillo/rojo) con cantidad, no solo "3/5"

### Cambios visuales
- Cada unidad es una card con bordes redondeados (`rounded-2xl`) y borde sutil
- Header de unidad con chevron a la izquierda + nombre + dots de estado a la derecha
- Temas solo visibles al expandir — scroll mucho más corto por defecto

---

## [2026-03-20 #4] — Rediseño UX: Detalle de Materia (mobile-first)

**Fecha / Hora:** 2026-03-20, noche
**MCP / Skills:** ux-pwa (análisis), frontend-design (implementación)
**Secciones:** Detalle de materia (SubjectDetailClient)

### Archivos modificados
- `app/(app)/subjects/[id]/SubjectDetailClient.tsx`

### Cambios técnicos
- Eliminados imports de `Card`, `CardHeader`, `CardTitle` y `ProgressBar` (ya no usados)
- Agregadas variables computadas: `hasUrgentRisk` (evento próximo ≤7 días + progreso <50%) y `hasPendingHomework` (badge en botón de post-clase)
- Reordenadas secciones: Header → Fechas importantes → Temario → Historial de clases
- Headers de unidad convertidos a acordeón clickeable con chevron animado y contador de temas (ej: "3/5")
- El botón "Ver todos (N)" separado reemplazado por hint de texto debajo de la preview colapsada

### Cambios en UX
- Botón de volver usa chevron SVG en lugar de `←` texto plano
- Post-clase y Agregar fecha pasaron de botones full-width a icon buttons (36px) en el header
- Barra de progreso general eliminada como sección independiente; reemplazada por barra compacta inline en el header (ancho 80px, altura 1.5px) con dots de estado al lado
- Porcentaje duplicado eliminado (solo aparece en la barra inline)
- Fechas importantes subidas al top del contenido (mayor prioridad visual)
- Historial de clases movido al final de la página
- Botón "+" contextual añadido dentro del header de "Fechas importantes" (junto a "Importar IA")
- Punto rojo pulsante en el header si hay evento próximo con bajo progreso

### Cambios visuales
- Header más compacto: toda la información clave en 2 líneas (nombre + barra/stats)
- Badge ambar sobre el icono de post-clase cuando hay tareas pendientes en historial
- Unidades del temario con contador verde/total y chevron que rota al expandir/colapsar

---

## [2026-03-20 #3] — UX/UI: unificación de modales y ajustes de agenda

**Fecha / Hora:** 2026-03-20, noche
**MCP / Skills:** —
**Secciones:** Modales (Imprevisto, Fecha importante, Post-clase), Agenda, EditEventModal

### Archivos modificados
- `app/globals.css`
- `components/features/EditEventModal.tsx`
- `components/features/FabMenu.tsx`
- `app/(app)/subjects/[id]/SubjectDetailClient.tsx`

### Cambios técnicos
- `globals.css`: agregada utilidad `.no-scrollbar` (faltaba en el proyecto; se usaba en Agenda pero no tenía efecto)
- `EditEventModal`: el botón "Duplicar evento" (full-width, fila propia) se fusionó en una sola fila con "Eliminar evento" — ambos como botones compactos `text-xs` alineados izquierda/derecha
- `FabMenu` EventoModal: formulario reescrito de standalone inputs con labels a grouped-card style (icon + campo inline dentro de `rounded-2xl bg-surface-2`), consistente con el modal de `SubjectDetailClient`
  - Card 1: Título + Tipo
  - Card 2: Fecha + Hora + Aula (aula condicional si tipo académico)
  - Card 3: Materia (condicional si tipo académico)
  - Se eliminó la sección Time+Aula separada que quedaba al final
- `FabMenu` PostClaseModal: campo descripción de tarea cambiado de `<input type="text" items-center>` a `<textarea rows={2} items-start>` con ícono con `mt-0.5`, consistente con `SubjectDetailClient`
- `SubjectDetailClient`: botones de cerrar de ambos modales (Post-clase y Fecha importante) actualizados de `w-8 h-8` (32px) a `w-11 h-11` (44px) para coincidir con el `ModalShell` del FabMenu y cumplir el mínimo táctil recomendado

### Cambios en UX
- El filtro de tipo en Agenda ya no muestra scrollbar horizontal visible
- El footer de Editar evento ocupa menos espacio vertical: "Duplicar" y "Eliminar" comparten una sola fila
- El modal de Fecha importante abierto desde el FAB ahora tiene la misma apariencia visual que el abierto desde la página de materia
- El campo de descripción de tarea en Post-clase (FAB) ahora admite múltiples líneas igual que en la página de materia
- Los botones de cerrar modales en la página de materia son más fáciles de presionar en móvil

### Cambios visuales
- EventoModal (FabMenu): inputs compactos dentro de cards con íconos, en lugar de campos con label flotante independiente
- EditEventModal footer: "Duplicar evento" (ícono + texto xs, izquierda) y "Eliminar evento" (texto xs rojo, derecha) en una misma fila, sin altura de botón completo

---

## [2026-03-20 #2] — Eventos académicos en el timeline + banner compacto

**Fecha / Hora:** 2026-03-20, tarde
**MCP / Skills:** —
**Secciones:** Plan del día, Bloques fijos, Sistema de tipos

### Archivos modificados
- `types/index.ts`
- `lib/fixed-blocks.ts`
- `app/api/ai/plan/route.ts`
- `app/api/ai/replan/route.ts`
- `app/(app)/today/TodayClient.tsx`

### Cambios técnicos
- Nuevo tipo `'exam'` en `BlockType` (antes solo: work, class, study, travel, gym, rest, free)
- `buildFixedBlocks` acepta nuevo parámetro opcional `todayAcademicEvent`
- Si el evento tiene `time` en su campo `notes` (JSON `{ time: "HH:MM" }`) → se crea un bloque `exam` fijo con esa hora. Duración por defecto: parcial=120min, parcial_intermedio=90min, entrega_tp=60min
- Si el evento no tiene `time` pero su `subject_id` coincide con una clase del día → el bloque de clase se reemplaza por un bloque `exam` con el mismo horario de la clase
- En ambos casos, la clase de esa materia se omite del plan (no aparecen duplicados)
- `/api/ai/replan/route.ts` ahora también consulta `academic_events` del día para pasarlo a `buildFixedBlocks`
- Banner del evento importante rediseñado: de bloque grande con ícono a chip inline de una línea

### Cambios en UX
- Si el usuario tiene un parcial cargado con horario, lo ve directamente en su timeline como bloque rojo — no tiene que inferirlo de la lista de eventos
- Si el parcial coincide en materia con una clase, ya no aparece la clase (el parcial la reemplaza en el mismo slot)
- El banner de "evento importante hoy" ya no ocupa tanto espacio en la pantalla — es una fila compacta

### Cambios visuales
- Nuevo bloque tipo `exam` en el timeline: fondo rojo `bg-red-500/15`, borde `border-red-500/40`, texto `text-red-300`
- Banner del evento: era un card grande con ícono centrado, ahora es un chip de una sola línea (icono + tipo + título truncado + badge HOY)
- Cuando no hay check-in y hay evento importante, el chip muestra "Check-in" como link en lugar del badge HOY

---

Formato por entrada:
- **Fecha / Hora**: fecha y hora aproximada (UTC-3, Argentina)
- **MCP / Skills**: herramientas de IA utilizadas en la sesión
- **Secciones**: área del producto afectada
- **Archivos modificados**: lista de archivos tocados
- **Cambios técnicos**: qué cambió a nivel de código/lógica
- **Cambios en UX**: qué experimenta distinto el usuario
- **Cambios visuales**: qué debería verse diferente en pantalla

---

## [2026-03-18] — Arquitectura del plan + lógica de prioridades

**Fecha / Hora:** 2026-03-18, tarde
**MCP / Skills:** —
**Secciones:** Generación de plan IA, Prioridades de estudio, Bloques fijos

### Archivos modificados
- `lib/fixed-blocks.ts` *(nuevo)*
- `lib/study-priority.ts`
- `lib/anthropic.ts`
- `types/index.ts`
- `app/api/ai/plan/route.ts`
- `app/api/ai/replan/route.ts`

### Cambios técnicos
- Extraída lógica de bloques fijos (trabajo, clases, viaje) a `lib/fixed-blocks.ts` — ahora es reutilizable entre `/api/ai/plan` y `/api/ai/replan`
- Regla de fallback para clases sin check-in: si `todayClasses.length > 0` y no hay check-in, se asume `has_faculty = true`
- Nuevo tipo `RecentClassLog` en `types/index.ts`
- `PlanGenerationContext` extendido con `recent_class_logs`, `today_academic_event`, `suppress_study_blocks`
- `buildClassLogBoosts()`: scoring de refuerzo por clases recientes con decaimiento a 14 días. Fórmula: `(5 - understanding_level) * recencyFactor * 8`
- Penalización por estancamiento en temas rojos: `+0.5 por día sin estudiar, tope 15`; nunca estudiado = 30 días de penalización
- `/api/ai/replan` ahora recibe `userConfig` y `class_schedule` y llama a `buildFixedBlocks` para respetar trabajo/clases/viaje
- Prompt de Claude enriquecido con sección `## CLASES RECIENTES` y niveles de comprensión por tema

### Cambios en UX
- El replan ya respeta los bloques de trabajo y clases del usuario (antes los ignoraba)
- Los temas con clases recientes y baja comprensión tienen mayor prioridad en el plan generado
- Temas rojos sin repasar por muchos días suben en prioridad automáticamente

### Cambios visuales
- Sin cambios de UI en esta entrada

---

## [2026-03-19] — Regenerar plan: preservación de estado + eventos académicos

**Fecha / Hora:** 2026-03-19, tarde
**MCP / Skills:** —
**Secciones:** Plan del día, Generación de plan IA, Eventos académicos

### Archivos modificados
- `app/api/ai/plan/route.ts`
- `app/(app)/today/TodayClient.tsx`
- `components/ui/Badge.tsx`

### Cambios técnicos
- Bloques completados y editados manualmente se preservan al regenerar el plan (no se descartan)
- Bloques fijos (trabajo, clase, viaje) restauran su estado `completed` tras la regeneración via `existingBlockById`
- `completionPct` recalculado al final del stream SSE con el estado real de todos los bloques — ya no revierte al valor anterior
- Detección de `todayAcademicEvent` (parcial, parcial_intermedio, entrega_tp) en la API
- Lógica `suppressStudyBlocks`: si hay evento importante hoy y ninguno en los próximos 2 días, no se generan bloques de estudio
- `Badge.tsx`: nuevo variant `exam-today` (amber bold con borde)
- Porcentaje de completado recalculado en el cliente al final del stream (`consumePlanStream` finally block)

### Cambios en UX
- Regenerar el plan ya no borra los bloques que el usuario marcó como realizados
- El % de progreso se mantiene correcto después de regenerar
- En días de parcial/TP sin eventos próximos, el plan no genera bloques de estudio adicionales — el foco queda en el evento presente

### Cambios visuales
- Banner amber en la pantalla de Hoy cuando hay un evento académico importante ese día
- El evento aparece resaltado con fondo amber en la lista de "Próximas fechas"
- Badge "HOY" en amber bold sobre el evento del día

---

## [2026-03-20] — Auditoría UX/UI + limpieza + fixes de interacción

**Fecha / Hora:** 2026-03-20, mañana
**MCP / Skills:** —
**Secciones:** Plan del día, Navegación, Sistema de diseño, Accesibilidad

### Archivos modificados
- `app/(app)/today/TodayClient.tsx`
- `components/layout/BottomNav.tsx` *(eliminado)*
- `app/globals.css`

### Cambios técnicos
- `BottomNav.tsx` eliminado — la navegación queda exclusivamente en el menú lateral (SideDrawer)
- `globals.css`: eliminados `@keyframes pulse-glow` y `.pulse-glow` (código muerto)
- `displayBlocks`: ya no requiere check-in para mostrar el plan — usa `blocks.length > 0` como condición
- Completion badge y barra de progreso visibles aunque no haya check-in
- `generatePlan()`: guarda scroll position antes de limpiar bloques (`scrollTopRef`) y restaura después del stream
- `generatePlan()`: mantiene el `%` anterior visible durante la regeneración en vez de resetear a 0
- `touchAction` en bloques del timeline: `pan-y` por defecto, `none` solo en el bloque siendo arrastrado (mejora scroll nativo en mobile)
- Padding inferior del grid: `pb-32 → pb-20` (ya no hay BottomNav que compensar)
- Check-in CTA: solo se muestra cuando no hay evento importante hoy (evita CTAs compitiendo)
- Aviso de "bloques de estudio suprimidos" cuando hay evento hoy y no se generaron bloques de estudio
- `aria-label` descriptivo en el botón de regenerar
- `title` en título truncado del evento en el banner (tooltip nativo)

### Cambios en UX
- El scroll no se pierde al regenerar el plan — vuelve a la misma posición
- El % de completado no parpadea en 0% durante la regeneración
- En mobile, el deslizamiento vertical de la página ya no se bloquea al tocar un bloque (solo bloquea cuando empieza el drag efectivo)
- Si hay un parcial/TP hoy, el banner ya incluye el link "Hacer check-in" en lugar de mostrar dos banners separados
- El usuario entiende por qué no hay bloques de estudio ese día (aviso explícito)
- Navegación simplificada: solo menú lateral, sin barra inferior duplicada

### Cambios visuales
- BottomNav ya no aparece en ninguna pantalla
- Padding inferior de pantallas reducido (menos espacio vacío al final)
- Badge "HOY" unificado usando el componente `<Badge variant="exam-today">` en banner y lista
- Fila del evento del día en lista: fondo `bg-amber-500/12` + borde izquierdo `border-l-2 border-l-amber-500/60` (era casi invisible con `/8`)
- Color de bloques de estudio en timeline: violet → amber (consistente con el resto del sistema de colores)
- Aviso amber sutil debajo del indicador de generación cuando se suprimen bloques de estudio
