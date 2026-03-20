# IAmentor — Registro de Cambios

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
