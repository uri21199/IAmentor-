# mejoras.md — Análisis integral de IAmentor

> Evaluación realizada el 2026-03-20. Perspectiva: equipo multidisciplinario UX/UI + Frontend + QA + Product Manager.

---

## 1. Diagnóstico general

IAmentor es una PWA de productividad académica para estudiantes universitarios argentinos que trabajan. Tiene una base técnica sólida: Next.js 14 App Router, SSE streaming para generación de planes, Supabase con RLS, sistema de notificaciones push, Pomodoro integrado, detección de alucinación de progreso y conexión con Google Calendar. El diseño dark-only es consistente y el sistema de tokens de color está bien aplicado.

**Fortalezas reales:**
- Generación de plan diario con IA via SSE (streaming progresivo, no espera de 5s)
- Detección de "alucinación de progreso" con mini-quiz cognitivo — feature genuinamente diferencial
- Revisión micro durante el viaje (micro_review en bloques travel) — altamente innovador
- Pomodoro con Web Audio API y wake lock — implementación completa
- Import de programa (syllabus) y fechas via IA desde archivo — elimina fricción de carga
- Sistema de prioridades de estudio por urgencia y estado de temas — lógica inteligente

**Debilidades estructurales:**
- Sin navegación bottom bar en mobile — la mayor fricción de UX
- Sin modo offline — PWA incompleta
- Notificaciones unread count hardcodeado en 0 (bug crítico de UX)
- Sin rate limiting en endpoints de IA (riesgo de seguridad y costo)
- Vulnerabilidad conocida en Next.js 14.2.15 sin resolver
- Componentes monolíticos (SubjectDetailClient tiene 150+ líneas solo de estado)

---

## 2. Problemas detectados

### 2.1 Flujo de usuario nuevo

**Onboarding:**
- Al llegar al paso 3 (Materias) sin haber creado cuatrimestre, el botón "Guardar y continuar" queda deshabilitado indefinidamente (`semesterId` es null). Si el usuario saltó el paso del semestre, no puede guardar materias. El flujo de skip está roto.
- `new Date()` se usa en `onboarding/OnboardingClient.tsx:26-32` para calcular el cuatrimestre por defecto, sin considerar UTC-3. Un usuario que abre la app a las 21hs en Argentina (medianoche UTC) podría recibir defaults del año incorrecto.
- No hay validación de que `start_date < end_date` en el paso del cuatrimestre. Se puede guardar un semestre con fechas invertidas sin error.

**Check-in:**
- Si el usuario cierra la app a mitad del check-in (5 pasos), todo el progreso se pierde. No hay persistencia de borrador.
- No hay indicación de cuántos check-ins hacen falta para que la IA tenga datos suficientes para generar un plan útil.
- El check-in es un flujo obligatorio para ver el plan, pero no hay estado "sin checkin de hoy" manejado elegantemente en Today — muestra botón de generar plan que puede fallar silenciosamente sin checkin.

**Materias / Temas:**
- El topic `full_description` existe en la base de datos y en los tipos, pero no hay forma visible en la UI de verlo o editarlo. Es datos que el usuario no puede acceder.
- No existe búsqueda o filtro por nombre de tema dentro de una materia con muchos temas.
- Al agregar una unidad, no se puede reordenar después (el campo `order_index` existe pero no hay drag & drop para unidades).
- Los temas se colapsan a 4 por unidad por defecto pero el estado `collapsedUnits` arranca en `true` para todas — el usuario nunca ve sus temas sin hacer clic extra.

### 2.2 Navegación y shell

**Bug crítico:** `notificationUnreadCount={0}` está hardcodeado en `components/layout/AppShell.tsx:72`. El badge del ícono de notificaciones siempre muestra 0, incluso si hay notificaciones sin leer. El usuario no recibe señal visual de alertas pendientes.

**Sin bottom navigation bar en mobile.** Toda la navegación pasa por el drawer del hamburger. Para las rutas más frecuentes (Hoy, Materias, Agenda, Stats) el usuario hace: tap hamburger → scroll/buscar ítem → tap. Son 3 gestos para cambiar de pantalla. En apps nativas (y PWAs bien diseñadas) son 1 tap.

**El FAB menu** existe como alternativa pero solo contiene acciones de creación, no de navegación. Además, su posición (bottom right) compite visualmente con el scroll y con el indicador de hora actual en la vista Today.

### 2.3 Vista Today

- Al regenerar el plan, `setBlocks([])` se llama antes de que el stream empiece. Hay un frame visible donde el calendario queda vacío. Debería mantenerse el plan anterior hasta que lleguen los primeros bloques.
- La vista de grilla temporal va de 6:00 a 24:00 (`GRID_START=6, GRID_END=24`). Si el usuario tiene bloques antes de las 6am (turno nocturno, por ejemplo), no se muestran.
- El banner de evento importante del día usa `localStorage` para persistir el estado de "dismissed", lo cual es correcto, pero al limpiar el storage (o en dispositivo nuevo) el banner vuelve a aparecer para eventos ya pasados si el usuario no los marcó.
- La línea de "hora actual" se calcula con `new Date()` cliente — correcto — pero el indicador solo refresca cada 60 segundos (`setInterval 60_000`). En pantalla puede estar desfasado hasta 59 segundos.
- No hay indicación visual de que un bloque fue editado manualmente (el campo `manually_edited` existe en el tipo pero no se usa en el render para diferenciarlo visualmente).

### 2.4 Gym

- El `weekNumber` se calcula como `Math.ceil(recentWorkouts.length / 5)` — esto asume exactamente 5 workouts por semana. Si el usuario entrena 3 días/semana o saltó semanas, el número de semana será incorrecto y el plan de ejercicios (que escala por semana) puede recomendar cargas equivocadas.
- `longestStreak` en `GymClient.tsx:69-80` compara fechas con `Math.abs(diff) <= 1`, lo que significa que dos entrenamientos el mismo día (edge case) o con un día de diferencia cuentan como racha continua. Debería ser diferencia exacta de 1 día, no `<= 1`.
- No hay forma de registrar ejercicios personalizados — el plan de ejercicios está fijo en `lib/exercises.ts`.
- No se puede ver el historial de pesos/reps por ejercicio. No hay tracking de progresión de cargas.

### 2.5 Stats

- Las estadísticas están limitadas a 30 días, sin opción de cambiar el período. Un estudiante que quiere ver su desempeño del cuatrimestre completo no puede.
- `avgEnergy` y `avgSleep` se calculan sobre todos los checkins sin filtrar por fecha — si hay datos de cuatrimestres anteriores en la consulta, distorsionan el promedio.
- El AI insight semanal se genera on-demand (el usuario toca un botón) y se guarda solo en estado local — desaparece al navegar. No persiste entre sesiones.
- No hay correlación visual entre energía y porcentaje de completión del plan (que sería el dato más valioso para el estudiante).

### 2.6 Notificaciones

- No hay forma de eliminar notificaciones individuales o en bulk. Solo se pueden marcar como leídas.
- Las notificaciones no tienen paginación — si hay muchas, todas cargan juntas.
- El campo `expires_at` existe en el tipo pero no se usa en la UI para ocultar notificaciones vencidas.

### 2.7 Settings

- La página de Settings está muy vacía: solo Google Calendar y push notifications. No hay ninguna forma de editar datos de perfil (nombre, email), cambiar horario de trabajo, editar el cuatrimestre activo ni modificar la cursada — todo está en rutas separadas que no son fáciles de descubrir desde Settings.
- No hay enlace desde Settings a `/trabajo`, `/cursada`, `/cuatrimestres` — las opciones de configuración están dispersas sin un hub claro.

### 2.8 Agenda

- La agenda no muestra eventos pasados por defecto. Un estudiante que quiere revisar un parcial que ya rindió tiene que... no puede, a menos que no haya filtro.
- No hay vista de "semana actual" — solo lista cronológica.
- No hay forma de agregar un evento desde la página Agenda directamente — hay que ir a la materia específica.

---

## 3. Mejoras UX/UI

### 3.1 Navegación — Bottom Tab Bar (prioridad máxima) — DESCARTADO (se mantiene menú lateral)

Reemplazar el hamburger-only mobile nav con una bottom navigation bar fija con 5 ítems: **Hoy · Materias · Agenda · Stats · Más**. El ítem "Más" abre el drawer con las rutas secundarias (Gym, Config, Notificaciones, etc.).

**Justificación:** las 4 rutas principales se usan múltiples veces por día. Cada navegación actual cuesta 3 gestos; con bottom bar cuesta 1. En 365 días esto suma miles de gestos innecesarios. Es la fricción más alta de la app y la que más impacto tiene en retención.

**Implementación:** agregar un componente `BottomNav` en `components/layout/` con los 4 ítems frecuentes y badge dinámico para notificaciones. Mantener el sidebar desktop tal como está.

### 3.2 Unread count dinámico en notificaciones — HECHO [2026-03-20 #7]

Conectar el badge de notificaciones al estado real. En `AppShell` cargar el count de notificaciones sin leer desde Supabase al montar (o via context/SWR). El campo ya existe en la DB. Es un cambio de ~10 líneas con enorme impacto en engagement.

### 3.3 Temas expandidos por defecto (o estado persistido) — HECHO [2026-03-20 #7]

El estado `collapsedUnits` arranca colapsado. Cambiar el default a expandido, o persistir el estado de expansión por materia en `localStorage`. La información de dominio (verde/amarillo/rojo) debe estar visible sin clic adicional — es el dato principal de la pantalla.

### 3.4 Indicador visual de bloque editado manualmente — DESCARTADO

Usar el campo `manually_edited` (ya existe en el tipo `TimeBlock`) para mostrar un indicador sutil (ej: punto o ícono de lápiz) en los bloques modificados por el usuario en la grilla de Today. Ayuda a distinguir lo que la IA generó de lo que el usuario personalizó, reduciendo confusión al replanificar.

### 3.5 Persistencia del borrador del check-in — HECHO (ya estaba implementado)

Guardar el estado parcial del check-in en `localStorage` con la fecha del día. Si el usuario cierra a mitad de flujo y vuelve a abrir el check-in el mismo día, retomar desde donde dejó. Limpiar el borrador al completar o al cambiar de día.

### 3.6 Sección "Configuración" como hub real — HECHO [2026-03-20 #7]

La ruta `/settings` debería ser el punto central de todo lo configurable. Agregar cards de acceso rápido a: Perfil · Horario laboral (`/trabajo`) · Cursada (`/cursada`) · Cuatrimestres (`/cuatrimestres`) · Notificaciones · Integraciones. Actualmente un usuario nuevo nunca descubre `/cursada` ni `/trabajo` desde Settings.

### 3.7 Estado vacío más informativo en Today sin check-in — HECHO [2026-03-21 #1]

Cuando no hay check-in del día, en vez de mostrar solo un botón "Generar plan", mostrar una card explicativa con contexto: "Para que la IA conozca tu día, completá el check-in matutino (2 min)". Si ya hay un plan de días anteriores, mostrar un resumen reducido del plan del día anterior como referencia.

### 3.8 Vista de correlación energía / completión en Stats — HECHO [2026-03-21 #1]

Agregar un gráfico de dos líneas superpuestas (energía promedio vs porcentaje de completión del plan) para los últimos 30 días. Este es el insight más valioso que la app puede mostrar: "cuando dormí bien, cumplo más del plan". Es el feedback loop que justifica hacer el check-in diario.

### 3.9 Feedback visual de bloque en tiempo real — HECHO [2026-03-21 #1]

Agregar micro-animación de tick/check al marcar un bloque completo. Actualmente el cambio es instantáneo pero sin feedback visual. Una animación de 200ms en el ícono de check aumenta la satisfacción percibida del logro.

### 3.10 Eliminar notificaciones vencidas automáticamente — HECHO [2026-03-20 #7]

Usar el campo `expires_at` de `AppNotification` para filtrar o marcar visualmente notificaciones que ya expiraron. Una notificación de "parcial en 1 día" de hace 3 semanas no aporta valor y aumenta el ruido.

---

## 4. Mejoras técnicas

### 4.1 Seguridad — Rate limiting en `/api/ai/*` (crítico) — HECHO [2026-03-21 #1]

Los endpoints `/api/ai/plan`, `/api/ai/replan`, `/api/ai/weekly-insight`, `/api/ai/parse-syllabus` y `/api/ai/parse-events` no tienen rate limiting. Un usuario (o bot) puede generar costos ilimitados en la API de Claude. Implementar con Upstash Redis (`@upstash/ratelimit`) — ya está en el backlog con clasificación Alta.

**Límites sugeridos:** `plan` → 10 req/día por usuario, `replan` → 5 req/día, `parse-syllabus` → 3 req/día.

### 4.2 Seguridad — Upgrade Next.js 14.2.15 a 15.x — POSTERGADO (requiere sesión dedicada, breaking changes en ~20 archivos)

Vulnerabilidad conocida en la versión actual. El upgrade es prioritario. Está en el backlog como Alta. Bloquea features como Partial Prerendering y mejoras de Server Actions que serían útiles aquí.

### 4.3 Eliminar `any` explícitos de interfaces críticas — HECHO [2026-03-21 #1]

En `TodayClient.tsx`, `StatsClient.tsx`, `GymClient.tsx` y `SubjectDetailClient.tsx` hay múltiples `any[]` que violan la convención del proyecto. Los tipos ya existen en `types/index.ts` (`CheckIn`, `DailyPlan`, `Workout`, `ClassLog`). Tipar correctamente elimina bugs de acceso a propiedades inexistentes que hoy fallan silenciosamente en runtime.

```typescript
// Cambiar en TodayClient Props:
upcomingEvents: AcademicEvent[]   // en vez de any[]

// Cambiar en StatsClient Props:
checkins: CheckIn[]
plans: DailyPlan[]
workouts: Workout[]
```

### 4.4 Corrección del cálculo de weekNumber en Gym — HECHO [2026-03-21 #1]

`Math.ceil(recentWorkouts.length / 5)` es incorrecto. Reemplazar con un cálculo basado en semanas calendario reales:

```typescript
// Contar semanas únicas que tuvieron al menos un workout
const weekKeys = new Set(recentWorkouts.map(w => format(parseISO(w.date), 'RRRR-II')))
const weekNumber = Math.max(1, weekKeys.size)
```

### 4.5 Unread count dinámico en AppShell — HECHO [2026-03-20 #7]

El `notificationUnreadCount={0}` hardcodeado en `AppShell.tsx:72` es un bug funcional. Opciones de implementación:

- **Opción A (simple):** pasar el count desde el Server Component padre que ya tiene acceso a Supabase, evitando fetch extra en cliente.
- **Opción B (reactivo):** usar Supabase Realtime para suscribirse a `notifications` con `read_status = false` del usuario y actualizar en tiempo real.

### 4.6 Descomponer SubjectDetailClient — PARCIAL [2026-03-21 #1] (SyllabusImport + EventsImport extraídos; ClassLogModal y UnitSection pendientes)

`SubjectDetailClient.tsx` tiene más de 150 líneas solo de declaraciones de estado. Es un componente de ~800+ líneas que maneja: temas, unidades, post-clases, eventos, import de syllabus, import de eventos, hallucination detection, drag de temas, etc. Descomponer en sub-componentes:

- `<UnitSection>` — gestión de una unidad con sus temas
- `<ClassLogModal>` — modal de post-clase aislado
- `<EventSection>` — sección de fechas importantes
- `<SyllabusImport>` — import de programa con IA

Esto mejora el tiempo de compilación, la testabilidad y la legibilidad.

### 4.7 Error boundary por sección en Today — HECHO [2026-03-21 #1]

Si la carga del plan falla (ej: Supabase down), `TodayClient` no muestra error al usuario — falla silenciosamente con `console.error`. Agregar try/catch con estado de error visible y botón de retry en la UI.

### 4.8 Prevenir flash de estado vacío al regenerar plan — HECHO [2026-03-20 #7]

En `generatePlan()` en `TodayClient.tsx:340-345`, `setBlocks([])` se llama antes de que lleguen los primeros bloques del stream. Solución: mantener los bloques actuales y reemplazarlos progresivamente a medida que llegan, en vez de vaciar primero.

### 4.9 Cron de pre-generación del plan a las 6AM — HECHO [2026-03-21 #1]

Ya está en el backlog. Implementar via Vercel Cron que ejecuta `/api/cron/generate-plans` cada día a las 06:00 UTC-3 (09:00 UTC). Requiere:
1. Guardar el checkin "estándar" del usuario como template para días con check-in tardío
2. O bien generar un plan provisional basado en el historial de energía y el calendario, que se reemplaza cuando el usuario hace el check-in

### 4.10 Loading skeletons — HECHO [2026-03-21 #1]

Las páginas de Stats, Subjects, Agenda y SubjectDetail cargan los datos en el Server Component y se bloquean hasta que Supabase responde. Agregar skeleton loaders con `loading.tsx` en cada ruta protegida para mejorar la perceived performance. El spinner genérico actual da la sensación de que la app es lenta.

---

## 5. Bugs y riesgos

### Bug crítico
| # | Descripción | Ubicación | Impacto | Estado |
|---|-------------|-----------|---------|--------|
| B1 | `notificationUnreadCount={0}` hardcodeado | `AppShell.tsx:72` | El badge de notificaciones nunca muestra actividad | HECHO [#7] |
| B2 | Flujo skip onboarding: si se salta el cuatrimestre, el paso de materias queda bloqueado (semesterId es null) | `OnboardingClient.tsx:138-156` | Usuario no puede completar onboarding con materias | PENDIENTE |
| B3 | Plan vacío flash al regenerar (`setBlocks([])` antes del stream) | `TodayClient.tsx:342` | Experiencia rota visualmente por 1-3 segundos | HECHO [#7] |

### Bug moderado
| # | Descripción | Ubicación | Impacto | Estado |
|---|-------------|-----------|---------|--------|
| B4 | `weekNumber` en Gym basado en `workouts.length / 5` — incorrecto para patrones irregulares | `GymClient.tsx:54` | Plan de ejercicios con semana incorrecta | HECHO [#1] |
| B5 | `longestStreak` cuenta `diff <= 1` como racha — dos entrenamientos en el mismo día inflan la racha | `GymClient.tsx:77` | Métricas de racha incorrectas | HECHO [#1] |
| B6 | `collapsedUnits` arranca en `true` — temas no visibles hasta clic manual | `SubjectDetailClient.tsx:56-59` | Primera experiencia con temas confusa | HECHO [#7] |
| B7 | `full_description` de temas sin UI de acceso | `types/index.ts:38` | Datos cargados (posiblemente por IA) invisibles para el usuario | PENDIENTE |
| B8 | Validación de `start_date < end_date` ausente en cuatrimestre | `OnboardingClient.tsx:113` | Semestres con fechas invertidas guardados en DB | HECHO [#7] |
| B9 | Notificaciones expiradas (`expires_at`) no se filtran en la UI | `NotificationsPage` | Notificaciones obsoletas contaminan la lista | HECHO [#7] |

### Riesgo de seguridad
| # | Descripción | Severidad | Estado |
|---|-------------|-----------|--------|
| R1 | Sin rate limiting en `/api/ai/*` | Alta — exposición a costos ilimitados | HECHO [#1] |
| R2 | Next.js 14.2.15 con vulnerabilidad conocida | Alta — upgrade urgente | POSTERGADO |
| R3 | Sin validación de tamaño de archivos en endpoints de parse-syllabus y parse-events | Media — DoS potencial por archivos grandes | PENDIENTE |

### Riesgo de datos
| # | Descripción | Severidad |
|---|-------------|-----------|
| R4 | Sin confirmación al eliminar una unidad con muchos temas en modo "delete_all" | Media — pérdida accidental de progreso |
| R5 | Sin backup export de datos del usuario | Baja-Media — si Supabase tiene incidente, el usuario pierde su historial |

---

## 6. Nuevas funcionalidades (producto)

### 6.1 Planificador semanal por materia — PENDIENTE (analizado [2026-03-21 #2])

Actualmente la IA genera un plan *diario*. Falta una vista de **planning semanal** donde el estudiante vea:
- Cuántas horas tiene disponibles esta semana (restando trabajo, clases, gym)
- Cuántos temas faltan revisar por materia
- Distribución sugerida por la IA: "Esta semana: 3h Análisis, 2h POO, 1h Redes"

**Diseño técnico aprobado:** nueva página `/app/(app)/weekly/` — Server Component con todos los datos, Client Component para UI. Nuevo endpoint `/api/ai/weekly-plan`. Sin DB nueva — plan semanal es sugerencia visual en localStorage. B6 en backlog.

### 6.2 Modo offline / Offline-first — HECHO [2026-03-21 #2]

- `next-pwa` (Workbox) ya manejaba caching de assets y páginas
- Nuevo `lib/offline-queue.ts`: cola localStorage para mutaciones offline; `fetchOrQueue`, `processQueue`, `getPendingCount`
- Nuevo `OfflineIndicator`: banner top con 3 estados (offline/sincronizando/sincronizado) integrado en el app layout

### 6.3 Gestión de archivos académicos — ALTERNATIVA PROPUESTA [2026-03-21 #2], PENDIENTE

En lugar de Supabase Storage (demasiado pesado para el contexto de materias), alternativa aprobada:
**Links y recursos por materia** — tabla `subject_resources (id, user_id, subject_id, unit_id?, title, url, created_at)`.
- Chips de link en la vista de materia / unidad
- Sin costo de storage, sin UI sobrecargada
- IA puede usar títulos de recursos como contexto

### 6.4 Spaced repetition SM-2 lite — HECHO [2026-03-21 #2]

- `/api/topics/complete`: cuenta completions previas del topic y calcula `next_review` con intervalos SM-2 lite (1/3/7/14/30 días). Actualiza la DB de forma non-blocking.
- `/api/topics/validate`: si el challenge falla, limpia `next_review`
- `SubjectDetailClient`: chip amber "N para repasar" en barra de progreso del header

### 6.5 Timer de estudio libre — HECHO [2026-03-21 #2]

- Nueva opción "Estudio libre" en el FAB (ícono reloj, violet)
- `EstudioModal`: selector materia + tema (optgroup por unidad)
- Al iniciar: `PomodoroFocus` fullscreen con `blockId=null`; registra en `pomodoro_sessions` con `block_id = null`

### 6.6 Exportación de datos — DESCARTADO

### 6.7 Widget de progreso para pantalla de inicio (PWA) — HECHO [2026-03-21 #2]

- `manifest.json`: campo `shortcuts` con 4 acciones: "Ver plan de hoy", "Mis materias", "Agenda", "Hacer check-in"
- En Android (PWA instalada), aparecen al mantener presionado el ícono

### 6.8 Calendario integrado multi-cuenta — DESCARTADO

### 6.9 Modo "Sprint de parcial" — DESCARTADO

---

## 7. Features innovadoras

### 7.1 "Modo viaje inteligente" — El diferencial actual expandido

La `micro_review` en bloques de viaje (repaso de conceptos durante el transporte) ya existe y es un feature único. Expandirlo:
- Mostrar las 3 píldoras de concepto en formato de flashcard swipeable (no solo texto plano)
- Agregar una pregunta de auto-evaluación al final del viaje: "¿Cuánto retuviste? 1-5"
- Estadística semanal: "Estudiaste 47 min en transporte esta semana" — un dato motivador único

### 7.2 "Energía predictiva" — IA que aprende tu patrón

Con 30+ días de check-ins, el sistema tiene datos de sueño, energía y completión de plan. Agregar un modelo simple de predicción:
- "Los lunes suele tenés energía baja (3.2/5 promedio). Hoy es lunes — te generamos un plan más liviano"
- Sin que el usuario haga nada, la IA ajusta la intensidad del plan según patrones históricos
- Mostrar en el plan: "Ajustamos la carga considerando tu patrón del día de hoy"

### 7.3 "Compañero de estudio IA" — Chat contextual

Un chat liviano (no un LLM completo) dentro de la app que tenga contexto de:
- Los temas de cada unidad y su estado
- El plan del día actual
- Los parciales próximos

El estudiante puede preguntar: "Explicate el Teorema de Bayes en 3 líneas para mi parcial de Estadística" y la IA responde con el contexto de *su* materia y *sus* temas marcados como pendientes. Diferencia clave vs ChatGPT: el contexto ya está cargado.

### 7.4 "Score de readiness" pre-parcial

3-5 días antes de cada parcial, calcular y mostrar un **índice de preparación** (0-100) basado en:
- % de temas verdes vs rojos en la materia
- Días de estudio registrados en los últimos 14 días para esa materia
- Resultados de los mini-quizzes de hallucination detection
- Horas de Pomodoro registradas

"Estás al 64% de preparación para Análisis Matemático. Necesitás repasar 3 temas clave para llegar al 80%". Esto convierte métricas pasivas en acción concreta.

### 7.5 "Post-parcial review" — Cierre del ciclo

Después de un parcial (detectado por el evento marcado en el calendario), mostrar un flujo de 3 pasos:
1. "¿Cómo salió? ¿Cuánto esperás sacar?"
2. "¿Qué temas vinieron que no tenías verdes?" (selección rápida)
3. IA genera una nota retrospectiva: "Estudiaste 8h en 5 días. Temas fuertes: X, Y. Para mejorar: Z"

Cierra el loop de aprendizaje y mejora las sugerencias del plan para el próximo parcial.

### 7.6 Comunidad (futuro) — Sharing de programas de materias

Si la app crece, los programas (units + topics) de materias comunes (Análisis 1, Álgebra, POO, etc.) pueden ser compartidos entre usuarios de la misma carrera/universidad. Un usuario sube el syllabus con IA, y otros pueden importarlo directamente sin tener que cargar nada. Red de efecto viral + contenido generado por usuarios.

### 7.7 Integración con plataformas académicas

Parsear notificaciones de email o scraping autorizado de plataformas como:
- **Campus virtual** (Moodle) — importar automáticamente fechas de entregas
- **SIU Guaraní** — importar materias del cuatrimestre y horarios oficiales

Elimina el paso más tedioso del onboarding: cargar materias y fechas manualmente.

---

## 8. Plan de acción priorizado

### Grupo A — Alto impacto / Bajo esfuerzo (Quick Wins)

| # | Acción | Impacto | Esfuerzo | Estado |
|---|--------|---------|---------|--------|
| A1 | Corregir `notificationUnreadCount` hardcodeado → leer desde DB | Muy alto | 1h | HECHO [#7] |
| A2 | Agregar bottom navigation bar en mobile | Muy alto | 4h | DESCARTADO |
| A3 | Corregir bug flash de plan vacío al regenerar | Alto | 1h | HECHO [#7] |
| A4 | Cambiar `collapsedUnits` default a `false` (temas visibles por defecto) | Alto | 30min | HECHO [#7] |
| A5 | Corregir cálculo de `weekNumber` en Gym a semanas calendario reales | Medio | 1h | HECHO [#1] |
| A6 | Agregar filtrado de notificaciones expiradas (`expires_at`) en UI | Medio | 1h | HECHO [#7] |
| A7 | Corregir bug del onboarding skip cuatrimestre → materias bloqueadas | Alto | 1h | PENDIENTE |
| A8 | Validar `start_date < end_date` en cuatrimestre | Medio | 30min | HECHO [#7] |
| A9 | Persistir borrador del check-in en localStorage | Alto | 2h | HECHO (ya estaba) |
| A10 | Agregar links a `/trabajo`, `/cursada`, `/cuatrimestres` desde Settings | Medio | 1h | HECHO [#7] |

### Grupo B — Alto impacto / Alto esfuerzo

| # | Acción | Impacto | Esfuerzo | Estado |
|---|--------|---------|---------|--------|
| B1 | Rate limiting en `/api/ai/*` con Upstash Redis | Crítico (seguridad) | 1 día | HECHO [#1] |
| B2 | Upgrade Next.js 14 → 15 | Crítico (seguridad) | 2-3 días | POSTERGADO |
| B3 | Cron de pre-generación del plan a las 6AM | Muy alto (UX) | 2 días | HECHO [#1] |
| B4 | Spaced repetition con SM-2 usando `next_review` existente | Muy alto (producto) | 3 días | HECHO [#2] |
| B5 | Loading skeletons en todas las páginas SSR | Alto (percepción) | 1 día | HECHO [#1] |
| B6 | Planificador semanal por materia | Muy alto (producto) | 5 días | PENDIENTE (diseño aprobado [#2]) |
| B7 | Modo offline / Service Worker con cola de sync | Alto (retención) | 3-4 días | HECHO [#2] |
| B8 | Descomponer `SubjectDetailClient` en sub-componentes | Alto (mantenibilidad) | 2 días | PARCIAL [#1] |
| B9 | Tipado correcto eliminando `any` de componentes principales | Medio (calidad) | 1 día | HECHO [#1] |
| B10 | Score de readiness pre-parcial | Alto (diferenciador) | 2 días | PENDIENTE |

### Grupo C — Bajo impacto (backlog)

| # | Acción |
|---|--------|
| C1 | Exportación de datos a PDF/CSV |
| C2 | Reordenamiento de unidades con drag & drop |
| C3 | Chat contextual con IA sobre temas de la materia |
| C4 | Integración de escritura bidireccional con Google Calendar |
| C5 | Gestión de archivos adjuntos por materia (Supabase Storage) |
| C6 | Widget de shortcuts para pantalla de inicio PWA |
| C7 | Flashcards swipeables en bloque de viaje |
| C8 | "Energía predictiva" basada en historial de check-ins |
| C9 | Post-parcial review con retrospectiva de IA |
| C10 | Sharing de programas de materias entre usuarios |

---

## Resumen ejecutivo para toma de decisiones

> _Actualizado 2026-03-21. Las sesiones #7 (2026-03-20), #1 y #2 (2026-03-21) resolvieron la mayoría de quick wins, mejoras técnicas críticas y las nuevas funcionalidades 6.2/6.4/6.5/6.7._

**Pendiente urgente:** A7 (onboarding skip bug), B2 (Next.js 15 upgrade), R3 (validación tamaño de archivos).

**Próximo foco de producto:** B6 (planificador semanal — diseño aprobado), B10 (score de readiness pre-parcial), 6.3 (links de recursos por materia) — son los features que diferencian IAmentor de una agenda digital común.

**Largo plazo:** C3 (chat IA contextual), C7 (flashcards viaje), C8 (energía predictiva), C10 (sharing de programas).
