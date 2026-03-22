# auditoria_proyecto.md — IAmentor
> Auditoría técnica realizada el 2026-03-21 por Claude Sonnet 4.6 (rol: Senior Software Engineer)

---

## 1. Resumen del sistema

IAmentor es una PWA académica para estudiantes universitarios argentinos que trabajan. El flujo central es:

```
Check-in matutino (5 pasos)
  → Claude genera plan del día vía SSE
  → Usuario ejecuta bloques
  → Stats + notificaciones inteligentes
```

### Módulos principales

| Módulo | Descripción |
|--------|-------------|
| **Auth / Middleware** | Supabase Auth SSR con cookies HTTPOnly. Middleware Next.js protege rutas `/(app)/`. |
| **Check-in** | Wizard de 5 pasos. Alimenta energía, modo de trabajo, facultad, viaje al contexto de IA. |
| **Plan IA (SSE)** | `POST /api/ai/plan` construye contexto completo (checkin + eventos + clases + prioridades) y hace streaming SSE de bloques. |
| **Replan** | `POST /api/ai/replan` ajusta plan desde hora actual al recibir descripción de imprevisto. |
| **Tracker académico** | Jerarquía Cuatrimestre → Materia → Unidad → Tema (rojo/amarillo/verde). |
| **Notificaciones** | Motor de triggers (`GET /api/notifications`): 7 tipos, deduplicación por UNIQUE, push VAPID. |
| **Gym** | Rotación automática de rutina. 48 ejercicios fijos. Ajuste por modo de estudio (exam_prep fuerza movilidad). |
| **Stats** | Completion %, energía, heatmap de dominio por materia, correlación energía/completión. |
| **Google Calendar** | OAuth2 con refresh automático. Eventos del día se inyectan al plan. |
| **Calificaciones** | `/grades` con flujo 3 pasos modal. Recuperatorio automático si nota < 4. |
| **Plan semanal** | `/weekly` genera distribución de estudio para la próxima semana con Claude. |
| **Cron** | Vercel Cron a las 09:00 UTC (06:00 ARG) pre-genera planes provisionales. |
| **Offline** | `OfflineIndicator` + `offline-queue.ts` para mutaciones pendientes. |

### Flujo de datos

```
[Usuario] → check-in → [Supabase: checkins]
                ↓
[API /api/ai/plan] → Lee DB (8 queries) → construye PlanGenerationContext
                ↓
[lib/anthropic: generateDailyPlanStream] → Claude SSE
                ↓
[Supabase: daily_plans.plan_json (JSONB)]
                ↓
[TodayClient] ← SSE en tiempo real → renderiza bloques
```

### Dependencias críticas

- **Supabase**: auth + db. Un outage bloquea toda la app.
- **Claude API**: plan, replan, parse, insight, weekly-plan, validate. Sin ella el core no funciona.
- **Upstash Redis**: rate limiting (opcional — falla silenciosa si no está configurado).
- **Google OAuth**: integración no crítica, falla silenciosa en plan.
- **Vercel**: cron, serverless functions, hosting.

---

## 2. Bugs y errores detectados

### BUG-01 — CRÍTICO: `/grades` no está protegido por el middleware

**Archivo:** [middleware.ts](middleware.ts#L27-L39)

```ts
const isAppRoute = request.nextUrl.pathname.startsWith('/today') ||
  // ... otras rutas ...
  request.nextUrl.pathname.startsWith('/notifications')
  // ❌ FALTA: '/grades'
```

La ruta `/grades` fue agregada en CHANGELOG `[2026-03-21 #6]` pero **nunca se agregó al middleware**. Un usuario no autenticado puede acceder a `/grades` directamente. El server component de esa ruta hace `supabase.auth.getUser()` internamente, por lo que no expondrá datos de otros usuarios (RLS lo previene), pero sí rendereará la página vacía sin redirigir al login — rompiendo la UX y exponiendo la existencia de la feature.

**Fix:** Agregar `|| request.nextUrl.pathname.startsWith('/grades')` al middleware.

---

### BUG-02 — ALTO: Rate limiting no aplica a `/api/ai/weekly-plan`

**Archivos:** [lib/rate-limit.ts](lib/rate-limit.ts#L36-L48), [app/api/ai/weekly-plan/route.ts](app/api/ai/weekly-plan/route.ts#L32)

El endpoint `weekly-plan` llama:
```ts
const rateLimitResponse = await checkRateLimit('weekly-plan', user.id)
```

Pero en `rate-limit.ts`, el Map solo registra: `plan`, `replan`, `parse-syllabus`, `parse-events`, `weekly-insight`. La clave `'weekly-plan'` **no existe** en el Map, así `limiter` es `undefined` y `checkRateLimit` retorna `null` → sin límite efectivo. Un usuario puede llamar este endpoint ilimitadas veces, incurriendo en costos de Claude API sin control.

**Fix:** Agregar `['weekly-plan', new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, '1 d'), prefix: 'rl:weekly-plan' })]` al Map de `ratelimitInstances`.

---

### BUG-03 — ALTO: Notificaciones usan timezone UTC del servidor (no UTC-3 Argentina)

**Archivo:** [app/api/notifications/route.ts](app/api/notifications/route.ts#L22-L24)

```ts
const today    = format(new Date(), 'yyyy-MM-dd')   // ❌ UTC del servidor
const todayDow = new Date().getDay()                  // ❌ UTC del servidor
```

El motor de plan usa `getTodayArg()` (que ajusta UTC-3), pero el motor de notificaciones usa `new Date()` directamente. Entre las 21:00 y 23:59 UTC (18:00–20:59 ARG), `today` será el día siguiente para Argentina. Esto causa:
- Alertas de clase incorrectas (busca horario del día equivocado)
- Deduplicación rota (`triggered_at` vs `today` desalineados)
- Notificaciones `exam_today` disparadas para el día siguiente

**Fix:** Reemplazar `format(new Date(), ...)` por `getTodayArg()` y calcular `todayDow` con `getDowArg()`.

---

### BUG-04 — ALTO: Cron pre-generación tiene race condition + sin `ignoreDuplicates`

**Archivo:** [app/api/cron/generate-plans/route.ts](app/api/cron/generate-plans/route.ts#L258-L269)

```ts
await supabase
  .from('daily_plans')
  .insert({                   // ❌ insert sin ignoreDuplicates
    user_id: userId,
    date: today,
    plan_json: planBlocks,
    completion_percentage: 0,
  })
  .select()
```

Si Vercel reintenta el cron (o si el usuario genera su plan entre el chequeo inicial y el insert del cron), el insert falla con violación de unique constraint. El error es tragado por el `try/catch` que solo incrementa `errors`, sin logging útil. El resultado es un `errors++` silencioso en el response JSON que nadie monitorea.

Adicionalmente, la verificación `usersWithPlan` se hace al inicio del request pero el insert ocurre segundos/minutos después — ventana de race condition con el flujo manual del usuario.

**Fix:** Usar `.upsert(..., { onConflict: 'user_id,date', ignoreDuplicates: true })` en lugar de `.insert()`.

---

### BUG-05 — MEDIO: SM-2 `next_review` calculado en UTC del servidor

**Archivo:** [app/api/topics/complete/route.ts](app/api/topics/complete/route.ts#L45-L47)

```ts
const nextReview = new Date()
nextReview.setDate(nextReview.getDate() + SM2_INTERVALS[rep])
```

`new Date()` en Vercel es UTC. Para un usuario argentino que completa un tema a las 23:30 (20:30 UTC), `nextReview` con intervalo de 1 día apuntará a las 20:30 UTC del día siguiente, que es las 17:30 ARG — un día antes de lo esperado. El heatmap y la visualización de "N para repasar" quedarán adelantados.

**Fix:** Usar `getTodayArg()` para construir la fecha base y calcular la fecha de próxima revisión en zona horaria Argentina.

---

### BUG-06 — MEDIO: Error silencioso en ImprevistoModal (replan)

**Archivo:** [components/features/FabMenu.tsx](components/features/FabMenu.tsx#L67-L69)

```ts
} catch {
  // silent
}
```

Si el replan falla (API error, rate limit 429, red caída), el usuario solo ve que el botón deja de cargar. No hay toast de error, no hay mensaje, no hay indicación de que algo salió mal. Considerando que replan es una acción crítica del flujo diario, este silencio es un bug de UX grave.

---

### BUG-07 — MEDIO: Validación de score en calificaciones sin límites

**Archivo:** [app/(app)/grades/GradesClient.tsx](app/(app)/grades/GradesClient.tsx#L73)

```ts
const parsedScore = score !== '' ? parseFloat(score) : null
```

No hay validación de rango. Un usuario puede ingresar `-5` o `999`. El trigger de recuperatorio (`score < 4`) podría activarse con valores negativos; el color de score calculado con `(score/max)*100` retornará valores inválidos. El `max_score` está hardcodeado a `10` para todos los casos.

---

### BUG-08 — BAJO: Offline queue no maneja expiración de sesión

**Archivo:** [lib/offline-queue.ts](lib/offline-queue.ts#L44-L73)

Al reconectar, las operaciones encoladas se reproducen con las cookies de sesión actuales. Si el usuario estuvo offline suficiente tiempo para que su JWT expire, todas las operaciones fallarán con 401, pero el sistema solo hace `failed++` sin notificar al usuario que debe volver a iniciar sesión. Las operaciones se mantienen en la queue indefinidamente hasta que el usuario cierra el browser.

---

### BUG-09 — BAJO: `type='button'` ausente en varios `<button>` dentro de `<form>`

Hay lugares en el código donde botones dentro de formularios implícitos (como los accordions en `SubjectDetailClient`) podrían disparar submit no intencionado. No es un bug activo visible, pero es un riesgo latente.

---

## 3. Código muerto / sin uso

### DEAD-01 — API de Recursos (feature removida del UI)

**Archivos:**
- [app/api/resources/route.ts](app/api/resources/route.ts)
- [app/api/resources/[id]/route.ts](app/api/resources/%5Bid%5D/route.ts)
- [supabase/migration_resources.sql](supabase/migration_resources.sql)
- `SubjectResource` en [types/index.ts](types/index.ts#L472-L480)

El CHANGELOG `[2026-03-21 #5]` documenta explícitamente: "Eliminada la sección Recursos del UI". Sin embargo, los endpoints API y el tipo TypeScript permanecen. Ningún componente cliente llama a estos endpoints. Son código muerto que aumenta la superficie de ataque y confunde a nuevos desarrolladores.

**Acción:** Eliminar `app/api/resources/`, el tipo `SubjectResource` de `types/index.ts`, y considerar una migración que droppee la tabla `subject_resources` si no tiene datos valiosos.

---

### DEAD-02 — `ExerciseFromAPI` type nunca utilizado

**Archivo:** [types/index.ts](types/index.ts#L314-L320)

```ts
export interface ExerciseFromAPI {
  id: number
  name: string
  category: string
  muscles: string[]
  equipment: string[]
  description: string
}
```

El GymClient usa ejercicios hardcodeados (array de 48 ejercicios en el componente). No hay ningún endpoint ni fetch que retorne `ExerciseFromAPI`. Este tipo parece vestigial de una integración con una API externa que nunca se implementó.

---

### DEAD-03 — `TravelLog` interface sin tabla DB correspondiente

**Archivo:** [types/index.ts](types/index.ts#L165-L172)

```ts
export interface TravelLog {
  id: string
  user_id: string
  date: string
  segments_json: TravelSegment[]
  studied_during_json: StudiedSegment[]
  created_at: string
}
```

No hay tabla `travel_logs` en el schema visible, no hay query que inserte en ella, no hay endpoint que la use. El tipo existe pero la funcionalidad de trackeo de viajes se resuelve via el `plan_json` de `daily_plans`.

---

### DEAD-04 — `WorkoutDay` y `WorkoutWeek` types posiblemente sin uso

**Archivo:** [types/index.ts](types/index.ts#L303-L312)

Estos tipos parecen diseñados para una vista de semana de entrenamientos que no está implementada. El `GymClient` usa estructuras locales propias.

---

### DEAD-05 — Duplicación del mapeo de tipos de evento

El mapeo `AcademicEventType → label` está definido en **al menos 3 archivos independientes**:
- `TodayClient.tsx`: `TYPE_LABELS` (línea 18)
- `FabMenu.tsx`: `EVENT_TYPES` array
- `WeeklyClient.tsx`: `TYPE_LABELS`
- `lib/study-priority.ts`: `getEventTypeLabel()`

Código duplicado que debe estar centralizado en `lib/study-priority.ts` (donde ya existe `getEventTypeLabel`) o en un archivo `lib/constants.ts`.

---

## 4. Inconsistencias

### INC-01 — CLAUDE.md desactualizado: dice Next.js 14.2.15, el proyecto usa 15.4.11

**Archivos:** [CLAUDE.md](CLAUDE.md) vs [package.json](package.json#L15)

```json
// package.json (real)
"next": "15.4.11"
```

CLAUDE.md dice: `Framework: Next.js App Router | 14.2.15`. El README también documenta Next 14 en el stack. El CHANGELOG `[2026-03-21 #4]` menciona el upgrade a Next.js 15, pero la documentación principal no fue actualizada. Esto genera confusión sobre compatibilidades de breaking changes entre v14 y v15 (especialmente en cookies de Supabase SSR).

---

### INC-02 — SDK version en CLAUDE.md no coincide con package.json

CLAUDE.md dice `@anthropic-ai/sdk 0.27.0`, pero el package.json usa `"^0.27.0"`, que permite actualizaciones a 0.28.x, 0.29.x, etc. Si hay breaking changes en el SDK, `^` podría romper silenciosamente tras un `npm install`.

---

### INC-03 — `GradeType` no cubre todos los `AcademicEventType` seleccionables

**Archivo:** [app/(app)/grades/GradesClient.tsx](app/(app)/grades/GradesClient.tsx#L74-L79)

```ts
const gradeType =
  selectedEvent.type === 'entrega_tp'
    ? 'tp'
    : selectedEvent.type === 'recuperatorio'
    ? 'parcial'
    : (selectedEvent.type as string)  // ❌ cast forzado
```

El `as string` en la última rama indica que `medico` y `personal` (tipos de evento seleccionables en el modal de calificaciones) no tienen equivalente en `GradeType`. Esto enviaría a la DB un `grade_type` inválido para esos casos. Los eventos personales y médicos deberían estar excluidos del selector de eventos en el modal de calificaciones.

---

### INC-04 — `GRADEABLE_TYPES` mencionado en CHANGELOG pero no tipado correctamente

El CHANGELOG menciona un array `GRADEABLE_TYPES` pero el modal de calificaciones muestra todos los eventos sin filtrar por tipo. Un evento de tipo `personal` puede recibir una nota, lo que semánticamente no tiene sentido.

---

### INC-05 — Comentario en cron vs vercel.json es correcto pero confuso

**Archivo:** [app/api/cron/generate-plans/route.ts](app/api/cron/generate-plans/route.ts#L8)

El comentario dice "6AM Argentina (09:00 UTC)" y `vercel.json` tiene `"0 9 * * *"`. Esto es correcto. Sin embargo, si Argentina adoptara horario de verano en el futuro, el cron quedaría desfasado sin aviso.

---

### INC-06 — `SubjectDetailClient` usa `classLogs: any[]` como tipo

**Archivo:** [app/(app)/subjects/[id]/SubjectDetailClient.tsx](app/(app)/subjects/%5Bid%5D/SubjectDetailClient.tsx#L34)

```ts
classLogs: any[]
```

El tipo `ClassLog` ya existe en `types/index.ts`. Usar `any[]` es una inconsistencia con el resto del proyecto y desactiva el chequeo de tipos para toda la sección de class logs.

---

## 5. Mejoras técnicas

### TECH-01 — Centralizar el mapeo de tipos de evento

Crear un archivo `lib/constants.ts` con:
```ts
export const EVENT_TYPE_LABELS: Record<AcademicEventType, string> = {
  parcial: 'Parcial',
  parcial_intermedio: 'Parcial Int.',
  entrega_tp: 'Entrega TP',
  medico: 'Turno médico',
  personal: 'Evento personal',
  recuperatorio: 'Recuperatorio',
}
```
Importar desde todos los componentes que hoy lo redefinen localmente.

---

### TECH-02 — Extraer `parseEventNotes()` a lib/utils

**Archivos:** [app/(app)/today/TodayClient.tsx](app/(app)/today/TodayClient.tsx#L26-L29), [app/(app)/subjects/[id]/SubjectDetailClient.tsx](app/(app)/subjects/%5Bid%5D/SubjectDetailClient.tsx#L26-L29)

Función idéntica definida en dos archivos:
```ts
function parseEventNotes(notes: string | null): { topic_ids?: string[] } {
  if (!notes) return {}
  try { const p = JSON.parse(notes); return typeof p === 'object' ? p : {} } catch { return {} }
}
```

Mover a `lib/utils.ts` y exportar.

---

### TECH-03 — Queries secuenciales en `/api/ai/plan` son paralizables

**Archivo:** [app/api/ai/plan/route.ts](app/api/ai/plan/route.ts#L42-L211)

Los pasos 1 (check-in), 2 (semestre+subjects), 4 (historial energía) y 5 (Google Calendar) pueden correr en paralelo. Actualmente son secuenciales. El paso 2 es el más pesado (5 queries anidadas). Paralelizar con `Promise.all` reduciría la latencia de setup antes del stream en ~200-500ms.

---

### TECH-04 — Cron sin límite de concurrencia ni batching

**Archivo:** [app/api/cron/generate-plans/route.ts](app/api/cron/generate-plans/route.ts#L72-L80)

```ts
for (const userId of targetUserIds) {
  await generateProvisionalPlan(...)  // secuencial — 1 usuario a la vez
}
```

Con N usuarios, el tiempo total es `N × (tiempo de generación de plan)`. En Vercel Hobby el timeout es 10s, en Pro es 5min. Para >10 usuarios esto timeoutea. Considerar:
1. Procesar en lotes concurrentes de 3-5 usuarios
2. O mover cada generación a una queue/background job (Vercel Queue, Inngest)

---

### TECH-05 — `SubjectDetailClient` demasiado grande (God Component)

**Archivo:** [app/(app)/subjects/[id]/SubjectDetailClient.tsx](app/(app)/subjects/%5Bid%5D/SubjectDetailClient.tsx)

El componente maneja: topics, units, class logs, events, hallucination guard, search, modals de edición, import de syllabus, import de eventos, y grades. Tiene >80 líneas solo de declaración de estado. Debería descomponerse en:
- `UnitAccordion` (topics + CRUD)
- `ClassLogSection` (logs + modal)
- `EventsSection` (fechas importantes + modal)

---

### TECH-06 — Rate limit sin feedback visual en el cliente

Cuando una respuesta 429 llega desde cualquier endpoint AI, el cliente la maneja como error genérico (o la ignora silenciosamente como en ImprevistoModal). El `Retry-After` header está presente pero nunca se usa para mostrar "Podés volver a generar en X minutos".

---

### TECH-07 — `@upstash/ratelimit` como peer dependency implícita

**Archivo:** [lib/rate-limit.ts](lib/rate-limit.ts#L26-L29)

```ts
// @ts-ignore — optional peer dependency, not installed until Upstash is configured
const { Redis }     = await import('@upstash/redis')
const { Ratelimit } = await import('@upstash/ratelimit')
```

Si alguien instala el proyecto sin las env vars pero con las dependencias, falla silenciosamente y no hay rate limiting. Si tiene las env vars pero no las dependencias, falla con un runtime error que la función `getInstances` traga silenciosamente. Debería estar como optional peer dependency en `package.json` y el error logueado con nivel `warn`.

---

### TECH-08 — `generateDailyPlan` vs `generateDailyPlanStream` — dos implementaciones

**Archivo:** [lib/anthropic.ts] (no leído directamente, inferido)

El cron usa `generateDailyPlan` (no-streaming) y el endpoint de plan usa `generateDailyPlanStream`. Dos funciones para el mismo prompt implica lógica de prompting duplicada. Idealmente habría una sola función con `stream: boolean` flag o un adapter.

---

## 6. Mejoras de experiencia (UX desde código)

### UX-01 — Sin feedback de error en acciones críticas del FAB

**Archivo:** [components/features/FabMenu.tsx](components/features/FabMenu.tsx)

- Replan: error silencioso (BUG-06)
- Post-clase: error silencioso
- Evento: no se verifica si se guardó correctamente

El FAB es el punto de entrada principal para 4 acciones críticas. Ninguna tiene manejo de error visible.

---

### UX-02 — Sin estado de carga durante la generación del plan inicial

Cuando el usuario hace check-in y va a `/today`, el plan empieza a llegar por SSE. Si hay latencia de red o Claude está lento, la UI muestra bloques apareciendo uno a uno sin ninguna indicación de cuántos faltan o del progreso total. Un skeleton con contador "generando bloque X de ~8" mejoraría la percepción de velocidad.

---

### UX-03 — Replan usa `router.refresh()` causando parpadeo

**Archivo:** [components/features/FabMenu.tsx](components/features/FabMenu.tsx#L65-L66)

```ts
setTimeout(() => {
  onClose()
  router.refresh()  // full page reload en App Router
}, 1500)
```

`router.refresh()` en Next.js App Router invalida el caché del Server Component y recarga la página completa. El usuario ve un flash/parpadeo después del éxito. La respuesta del replan ya contiene los bloques actualizados — deberían actualizarse en estado local del cliente directamente.

---

### UX-04 — Modal de calificaciones permite seleccionar eventos `medico`/`personal`

**Archivo:** [app/(app)/grades/GradesClient.tsx](app/(app)/grades/GradesClient.tsx#L62-L67)

```ts
const availableEvents = selectedSubject
  ? [
      ...events.filter(e => e.subject_id === selectedSubject.id),
      ...events.filter(e => e.subject_id !== selectedSubject.id),
    ]
  : events
```

Eventos de tipo `medico` y `personal` aparecen en el selector. Asignarle una nota a un turno médico no tiene sentido académico y puede generar datos corruptos en la DB (grade_type inválido).

---

### UX-05 — Indicador offline sin acento ortográfico

**Archivo:** [components/layout/OfflineIndicator.tsx](components/layout/OfflineIndicator.tsx#L82)

```
"— se sincronizara cuando vuelvas a conectarte"
                ↑
         falta el acento: "sincronizará"
```

Error tipográfico en UI visible.

---

### UX-06 — Plan provisional no diferenciado visualmente del plan real

Según README, el plan provisional se muestra con un banner "Plan provisional — hacé el check-in para personalizarlo". Sin embargo, si el usuario ignora el banner y empieza a completar bloques en el plan provisional, esos bloques quedarán marcados como completados. Al generar el plan real, la lógica preserva bloques completados (BUG potencial: el plan provisional puede dejar "fantasmas" de bloques completados en el plan real si los IDs coinciden).

---

### UX-07 — Sin paginación en historial de notificaciones

**Archivo:** [app/api/notifications/route.ts](app/api/notifications/route.ts#L212-L218)

El endpoint retorna solo las últimas 20 no leídas. Si el usuario tiene >20 no leídas, las más antiguas son inaccesibles desde la UI. No hay endpoint de scroll infinito ni paginación en la página de notificaciones.

---

## 7. Nuevas implementaciones sugeridas

### NEW-01 — Toast / Snackbar global para errores de API

**Prioridad:** Alta — impacta todas las acciones del usuario

Implementar un `ToastContext` (el tipo `ToastMessage` ya existe en `types/index.ts`) conectado a todos los `fetch` de acción del cliente. Hoy el tipo está definido pero no hay implementación de toasts. Requiere:
- `ToastProvider` en `app/(app)/layout.tsx`
- Hook `useToast()` en `FabMenu`, `GradesClient`, `SubjectDetailClient`

---

### NEW-02 — Focus trap en modales

**Prioridad:** Media (accesibilidad) — está en el backlog de README

Los modales actuales (FabMenu, GradesClient, EditEventModal) no tienen focus trap. Con teclado o lectores de pantalla, el focus puede escapar del modal. Implementar con `@radix-ui/react-dialog` o un custom `useFocusTrap` hook.

---

### NEW-03 — Error boundary a nivel de bloque del plan

**Prioridad:** Media

Si un `TimeBlock` tiene datos malformados (e.g., `start_time` inválido, `micro_review` roto), el `TodayClient` completo crashea. Wrappear el render de cada bloque en un ErrorBoundary de React permite degradar gracefully: mostrar el bloque con datos básicos en lugar de romper toda la vista del día.

---

### NEW-04 — Monitoreo de errores del cron

**Prioridad:** Alta (observabilidad)

El cron actualmente retorna `{ ok, generated, errors, total }` pero nadie monitorea ese response. Si `errors > 0`, no hay alerta. Implementar:
- Webhook a Slack/Discord cuando `errors > 0`
- O integrar Sentry / Axiom para logging estructurado de la function

---

### NEW-05 — Validar `subject_id` en endpoints de grades, topics, events

**Prioridad:** Alta (seguridad)

Los endpoints de calificaciones y topics no verifican que el `subject_id` enviado pertenezca al usuario autenticado antes de operar. RLS de Supabase previene la exposición de datos, pero el endpoint podría recibir un `subject_id` de otro usuario y retornar 200 sin hacer nada (el upsert simplemente no matchea). Mejor retornar 403 explícito si el subject no pertenece al usuario.

---

### NEW-06 — Exportar plan a `.ics`

**Prioridad:** Baja — mencionado en el backlog del README

Los `TimeBlock[]` del `daily_plans.plan_json` tienen todos los campos necesarios (`start_time`, `end_time`, `title`). La generación de un `.ics` válido es straightforward con una función pura. Permitiría sincronizar el plan generado por IA con cualquier calendario externo además de Google.

---

### NEW-07 — Historial de planes pasados

**Prioridad:** Media — mencionado en el backlog del README

La tabla `daily_plans` ya almacena todos los planes históricos. Falta solo la vista `/history` que los liste con filtro por semana/mes y permita ver el `plan_json` de días pasados. Podría integrarse en la página de Stats.

---

## 8. Plan de acción priorizado

### Tier 1 — Alto impacto / Bajo esfuerzo (hacer esta semana)

| # | Hallazgo | Esfuerzo estimado |
|---|----------|-------------------|
| BUG-01 | Agregar `/grades` al middleware | 1 línea |
| BUG-02 | Agregar `weekly-plan` al rate limiter | 3 líneas |
| BUG-03 | Usar `getTodayArg()` en notifications/route.ts | 5 líneas |
| BUG-04 | Cambiar `.insert()` a `.upsert()` en cron | 5 líneas |
| UX-05 | Corregir typo "sincronizará" en OfflineIndicator | 1 línea |
| INC-01 | Actualizar CLAUDE.md con Next.js 15 | 5 líneas |
| TECH-02 | Extraer `parseEventNotes()` a lib/utils | 15 líneas |
| UX-04 | Filtrar eventos medico/personal del selector de calificaciones | 5 líneas |

---

### Tier 2 — Alto impacto / Esfuerzo medio (próximo sprint)

| # | Hallazgo | Esfuerzo estimado |
|---|----------|-------------------|
| BUG-05 | SM-2 next_review en timezone Argentina | 20 líneas |
| BUG-06 | Error feedback en ImprevistoModal | 20 líneas |
| BUG-07 | Validar rango de score en calificaciones | 10 líneas |
| NEW-01 | Toast global para errores de API | 1-2 días |
| TECH-01 | Centralizar EVENT_TYPE_LABELS en lib/constants | 30 líneas |
| TECH-03 | Paralelizar queries en /api/ai/plan | 30 líneas |
| NEW-04 | Monitoreo de errores del cron | 0.5 días |
| INC-06 | Tipar `classLogs` con `ClassLog[]` en SubjectDetailClient | 10 líneas |

---

### Tier 3 — Alto impacto / Alto esfuerzo (backlog con deadline)

| # | Hallazgo | Esfuerzo estimado |
|---|----------|-------------------|
| TECH-04 | Batching/concurrencia en cron | 1-2 días |
| TECH-05 | Descomponer SubjectDetailClient | 2-3 días |
| NEW-02 | Focus trap en modales (accesibilidad) | 1 día |
| NEW-03 | Error boundary por bloque del plan | 1 día |
| UX-03 | Actualización local post-replan (sin router.refresh) | 1 día |
| NEW-05 | Validar ownership de subject_id en endpoints | 1 día |
| TECH-08 | Unificar generateDailyPlan / generateDailyPlanStream | 1 día |

---

### Tier 4 — Bajo impacto (backlog sin urgencia)

| # | Hallazgo | Descripción |
|---|----------|-------------|
| DEAD-01 | Eliminar API de recursos | Limpiar código muerto |
| DEAD-02 | Eliminar `ExerciseFromAPI` type | Limpiar types |
| DEAD-03 | Eliminar `TravelLog` type | Limpiar types |
| DEAD-04 | Verificar/eliminar `WorkoutDay`, `WorkoutWeek` | Limpiar types |
| UX-06 | Proteger plan provisional de completions prematuras | Mejora de flujo |
| UX-07 | Paginación en notificaciones | Feature nueva |
| NEW-06 | Exportar plan a .ics | Feature nueva |
| NEW-07 | Historial de planes pasados | Feature nueva |
| BUG-08 | Offline queue + expiración de sesión | Edge case |
| TECH-06 | Mostrar Retry-After en UI al recibir 429 | Mejora de feedback |

---

*Fin de auditoría — IAmentor v0.1.0 — 2026-03-21*
