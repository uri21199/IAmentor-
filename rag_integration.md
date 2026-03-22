# IAmentor — Preparación para integración con Agente RAG

> **Contexto:** Vamos a conectar IAmentor con un Agente RAG (Python + ChromaDB + LlamaIndex) que indexa los apuntes, PDFs y materiales del estudiante y responde preguntas basándose en ellos. Este documento define los cambios a implementar en IAmentor para dejarlo listo para esa conexión.
> El RAG Service todavía no existe — el objetivo ahora es preparar IAmentor sin romper nada de lo que ya funciona.

---

## 1. Nueva columna en `subjects`

Agregar `rag_folder_slug` a la tabla `subjects` en Supabase. Es el vínculo entre una materia de IAmentor y la carpeta local del RAG.

```sql
-- supabase/migration_rag_prep.sql
ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS rag_folder_slug TEXT;
-- Ejemplo: "Algoritmos y Estructuras de Datos II" → "algoritmos"
```

---

## 2. Nueva tabla `rag_study_sessions`

Registra las sesiones de estudio que el estudiante haga con el RAG. Cuando el RAG esté conectado, escribirá acá. Por ahora la tabla existe vacía.

```sql
CREATE TABLE IF NOT EXISTS rag_study_sessions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  materia         TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  duracion_min    INTEGER,
  temas_json      JSONB DEFAULT '[]',
  fuentes_json    JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE rag_study_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own rag sessions"
  ON rag_study_sessions FOR ALL USING (auth.uid() = user_id);
```

---

## 3. Variables de entorno nuevas

Agregar a `.env.local` (sin valores reales por ahora, solo las claves):

```bash
# RAG Service — dejar vacío hasta que el servicio esté levantado
RAG_SERVICE_URL=http://localhost:8001
RAG_INTERNAL_SECRET=
```

---

## 4. Cliente HTTP para el RAG — `lib/rag-client.ts`

Crear este archivo. Por ahora solo tiene el status check — el resto de métodos se agregan cuando el servicio exista.

```typescript
// lib/rag-client.ts

const RAG_URL  = process.env.RAG_SERVICE_URL    ?? 'http://localhost:8001'
const RAG_SECRET = process.env.RAG_INTERNAL_SECRET ?? ''

/**
 * Verifica si el RAG Service está corriendo.
 * Retorna false en lugar de tirar error — permite degradación graceful.
 */
export async function checkRAGStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${RAG_URL}/status`, {
      signal: AbortSignal.timeout(3_000),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Placeholder — se implementa cuando el RAG Service esté listo.
 */
export async function queryRAG(_params: unknown): Promise<null> {
  return null
}
```

---

## 5. Función `buildAcademicContext()` — `lib/rag-context.ts`

Construye el objeto de contexto que IAmentor enviará al RAG en cada consulta. Concentra toda la información académica relevante del estudiante en un solo lugar.

```typescript
// lib/rag-context.ts
import { SupabaseClient } from '@supabase/supabase-js'
import { differenceInDays } from 'date-fns'

export interface AcademicContext {
  materiaActiva:            string
  modo:                     'exam_prep' | 'active_review' | 'normal'
  diasHastaProximoParcial:  number | null
  temasUrgentes:            { nombre: string; topic_id: string }[]
  temasEnProgreso:          { nombre: string; topic_id: string }[]
  horasDisponibles:         number | null
  energia:                  number | null
}

export async function buildAcademicContext(
  supabase: SupabaseClient,
  userId:   string,
  subjectId: string
): Promise<AcademicContext> {

  // Temas de la materia agrupados por estado
  const { data: topics } = await supabase
    .from('topics')
    .select('id, name, mastery_status, unit:units!inner(subject_id)')
    .eq('unit.subject_id', subjectId)

  // Próximo evento académico de esa materia
  const { data: nextEvent } = await supabase
    .from('academic_events')
    .select('title, date, type')
    .eq('subject_id', subjectId)
    .gte('date', new Date().toISOString())
    .order('date', { ascending: true })
    .limit(1)
    .maybeSingle()

  // Plan del día — para extraer horas disponibles y energía
  const today = new Date().toISOString().split('T')[0]
  const { data: plan } = await supabase
    .from('daily_plans')
    .select('blocks_json, energy_level')
    .eq('user_id', userId)
    .eq('date', today)
    .maybeSingle()

  const diasHastaExamen = nextEvent
    ? differenceInDays(new Date(nextEvent.date), new Date())
    : null

  const modo: AcademicContext['modo'] =
    diasHastaExamen !== null && diasHastaExamen <= 7  ? 'exam_prep'     :
    diasHastaExamen !== null && diasHastaExamen <= 21 ? 'active_review' :
    'normal'

  return {
    materiaActiva:           subjectId,
    modo,
    diasHastaProximoParcial: diasHastaExamen,
    temasUrgentes:   (topics ?? []).filter(t => t.mastery_status === 'red')
                       .map(t => ({ nombre: t.name, topic_id: t.id })),
    temasEnProgreso: (topics ?? []).filter(t => t.mastery_status === 'yellow')
                       .map(t => ({ nombre: t.name, topic_id: t.id })),
    horasDisponibles: null, // TODO: extraer de blocks_json cuando el RAG esté activo
    energia:          plan?.energy_level ?? null,
  }
}
```

---

## 6. API Route — `app/api/rag/query/route.ts`

El cliente nunca llama al RAG directamente — pasa por esta ruta de Next.js para que `RAG_SERVICE_URL` nunca quede expuesta en el browser.

Por ahora retorna `503` siempre (el servicio no existe todavía). Cuando el RAG esté listo, se descomenta la lógica real.

```typescript
// app/api/rag/query/route.ts
import { createServerClient } from '@/lib/supabase/server'
import { checkRAGStatus }     from '@/lib/rag-client'

export async function POST(req: Request) {
  // TODO: cuando el RAG Service esté listo, descomentar la lógica completa.
  const ragOnline = await checkRAGStatus()
  if (!ragOnline) {
    return Response.json({ error: 'rag_unavailable' }, { status: 503 })
  }

  // const { pregunta, subjectId, modo } = await req.json()
  // const supabase = createServerClient()
  // const { data: { user } } = await supabase.auth.getUser()
  // const context = await buildAcademicContext(supabase, user!.id, subjectId)
  // const response = await queryRAG({ pregunta, context, modo })
  // return Response.json(response)

  return Response.json({ error: 'rag_unavailable' }, { status: 503 })
}
```

---

## 7. Badge de estado en `/settings`

Agregar un indicador visual que muestre si el RAG Service está activo. Llama a `checkRAGStatus()` en el Server Component de la página.

```tsx
// En app/(app)/settings/page.tsx — agregar al final de la página

import { checkRAGStatus } from '@/lib/rag-client'

// Dentro del componente (es async Server Component):
const ragOnline = await checkRAGStatus()

// JSX a agregar:
<section>
  <h2 className="text-sm font-medium text-text-secondary mb-3">
    Asistente de Estudio RAG
  </h2>
  <div className="flex items-center gap-2 text-sm">
    <span className={`w-2 h-2 rounded-full ${ragOnline ? 'bg-green-500' : 'bg-surface-secondary'}`} />
    <span className="text-text-primary">
      {ragOnline ? 'Servicio activo' : 'No disponible'}
    </span>
  </div>
  {!ragOnline && (
    <p className="text-xs text-text-tertiary mt-1">
      Iniciá el servicio local con <code>./start.sh</code> en el repo del agente RAG.
    </p>
  )}
</section>
```

---

## 8. Campo `rag_folder_slug` en Settings de materia

En la pantalla de configuración de cada materia, agregar un campo de texto para que el usuario mapee la materia con su carpeta local del RAG.

```tsx
// En el formulario de edición de materia (donde ya está nombre, color, etc.)
<div>
  <label className="text-xs text-text-secondary">
    Carpeta RAG (opcional)
  </label>
  <input
    type="text"
    placeholder="ej: algoritmos"
    value={ragFolderSlug}
    onChange={e => setRagFolderSlug(e.target.value)}
    className="input-base mt-1"
  />
  <p className="text-xs text-text-tertiary mt-1">
    Nombre de la carpeta en /materias/ del agente RAG
  </p>
</div>

// Al guardar, incluir en el PATCH:
// { rag_folder_slug: ragFolderSlug || null }
```

---

## Resumen de archivos a tocar

| Archivo | Acción |
|---------|--------|
| `supabase/migration_rag_prep.sql` | Crear — migration nueva |
| `lib/rag-client.ts` | Crear |
| `lib/rag-context.ts` | Crear |
| `app/api/rag/query/route.ts` | Crear |
| `app/(app)/settings/page.tsx` | Modificar — agregar badge de estado |
| Formulario de edición de materia | Modificar — agregar campo `rag_folder_slug` |
| `.env.local` | Modificar — agregar 2 variables |

> Ningún cambio modifica tablas existentes ni rompe features actuales. Todo es aditivo.
> El objetivo es que cuando el RAG Service esté listo, la conexión sea enchufar la URL y descomentar código.
