# IAmentor — Guía de Setup Completa

Guía para levantar el proyecto desde cero en local y desplegarlo en producción.

---

## Tabla de contenidos

1. [Prerequisitos](#1-prerequisitos)
2. [Variables de entorno](#2-variables-de-entorno)
3. [Instalación local](#3-instalación-local)
4. [Configuración de Supabase](#4-configuración-de-supabase)
5. [Configuración de Google OAuth (Calendar)](#5-configuración-de-google-oauth-calendar)
6. [Configuración de Anthropic (Claude API)](#6-configuración-de-anthropic-claude-api)
7. [Configuración de Web Push (Notificaciones)](#7-configuración-de-web-push-notificaciones)
8. [Desarrollo local](#8-desarrollo-local)
9. [Primer usuario y seed de datos](#9-primer-usuario-y-seed-de-datos)
10. [Tests E2E](#10-tests-e2e)
11. [Deploy en Vercel](#11-deploy-en-vercel)
12. [Hard reset de base de datos](#12-hard-reset-de-base-de-datos)
13. [Comandos de referencia rápida](#13-comandos-de-referencia-rápida)
14. [Troubleshooting](#14-troubleshooting)
15. [Archivos de configuración importantes](#15-archivos-de-configuración-importantes)
16. [Flujos principales de uso](#16-flujos-principales-de-uso)

---

## 1. Prerequisitos

| Herramienta | Versión mínima | Notas |
|-------------|----------------|-------|
| Node.js | 18.x o 20.x | [nodejs.org](https://nodejs.org) |
| npm | 9.x+ | Viene con Node.js |
| Git | Cualquiera | Para clonar el repo |
| Cuenta Supabase | — | [supabase.com](https://supabase.com) — Free alcanza para dev |
| Cuenta Anthropic | — | [console.anthropic.com](https://console.anthropic.com) |
| Cuenta Google Cloud | — | Solo si querés integración de Calendar |
| Cuenta Vercel | — | Solo para deploy en producción |

> **Importante (Windows):** `npm.cmd` puede fallar en Git Bash o PowerShell.
> Usar siempre `node node_modules/next/dist/bin/next dev` como alternativa segura.

---

## 2. Variables de entorno

Crear el archivo `.env.local` en la **raíz del proyecto** con estas variables:

```bash
# ── Supabase (formato v2+ con sb_publishable_ / sb_secret_) ──
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROJECT-ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_XXXXXXXXXXXXXXXXXX
SUPABASE_SERVICE_ROLE_KEY=sb_secret_XXXXXXXXXXXXXXXXXX

# ── Anthropic (Claude API) ────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-api03-XXXXXXXXXXXXXXXXXXXXXXXX

# ── Google Calendar OAuth ─────────────────────────────────────
GOOGLE_CLIENT_ID=XXXXXXXXXX.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-XXXXXXXXXXXXXXXXXXXXXXXX

# ── Web Push (VAPID) ──────────────────────────────────────────
NEXT_PUBLIC_VAPID_PUBLIC_KEY=Bxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VAPID_PRIVATE_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VAPID_MAILTO=mailto:tu@email.com

# ── App URL (cambiar por la URL de producción al deployar) ────
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# ── Secret interno (autenticación de /api/push/send) ─────────
INTERNAL_SECRET=una_cadena_aleatoria_larga_y_segura

# ── Vercel Cron (pre-generación del plan a las 6AM) ──────────
CRON_SECRET=otra_cadena_aleatoria_larga_y_segura

# ── Upstash Redis (rate limiting en /api/ai/*) ───────────────
UPSTASH_REDIS_REST_URL=https://TU-INSTANCIA.upstash.io
UPSTASH_REDIS_REST_TOKEN=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Dónde conseguir cada variable

| Variable | Dónde encontrarla |
|----------|-------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → `anon public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → `service_role` key (**nunca al cliente**) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys → Create Key |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → APIs → Credentials → OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Mismo lugar que Client ID |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Generado con `npx web-push generate-vapid-keys` (ver sección 7) |
| `VAPID_PRIVATE_KEY` | Idem anterior |
| `VAPID_MAILTO` | Email de contacto para identificarse ante servidores push (ej: `mailto:admin@mentoria.app`) |
| `INTERNAL_SECRET` | Cadena aleatoria que elegís vos (mínimo 32 caracteres) |
| `CRON_SECRET` | Cadena aleatoria para autenticar el Vercel Cron Job |
| `UPSTASH_REDIS_REST_URL` | [console.upstash.com](https://console.upstash.com) → Create Database → REST API |
| `UPSTASH_REDIS_REST_TOKEN` | Mismo lugar que la URL |

> **Importante:** `.env.local` está en `.gitignore`. Nunca commitear este archivo.

---

## 3. Instalación local

```bash
# 1. Clonar el repositorio
git clone <URL-DEL-REPO> IAmentor
cd IAmentor

# 2. Instalar dependencias
npm install

# 3. Crear el archivo de variables de entorno
# (no existe .env.local.example — crearlo manualmente con el contenido de la sección 2)
```

---

## 4. Configuración de Supabase

### 4.1 Crear el proyecto

1. Ir a [supabase.com](https://supabase.com) → New Project
2. Elegir nombre del proyecto (ej: `iamentor`)
3. Región recomendada: South America (`sa-east-1`) para menor latencia desde Argentina
4. Guardar la contraseña de la DB en un lugar seguro

### 4.2 Ejecutar el schema principal

1. En el dashboard de Supabase → **SQL Editor** → New Query
2. Copiar el contenido completo de `supabase/schema.sql`
3. Ejecutar (crea tablas base, RLS, índices y la función `seed_initial_data()`)

```sql
-- Verificar que se crearon las tablas base:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Esperado tras schema.sql:
-- academic_events, checkins, class_logs, daily_plans, semesters,
-- subjects, topics, travel_logs, units, user_integrations, workouts
```

### 4.3 Ejecutar todas las migraciones en orden

Ejecutar cada migración en SQL Editor en este orden exacto:

| Archivo | Qué agrega |
|---------|------------|
| `supabase/migrations_v3.sql` | Tablas: `profiles`, `user_config`, `class_schedule`, `notifications` |
| `supabase/migrations_v4.sql` | Columna `topics_covered_json` en `class_logs` |
| `supabase/migrations_v5.sql` | Columna `due_date` en `class_logs` |
| `supabase/migrations_v6.sql` | Tabla `push_subscriptions`, columna `is_employed` en `user_config`, UNIQUE constraint en `notifications` |
| `supabase/migrations_v7.sql` | Tabla `pomodoro_sessions` (v1) |
| `supabase/migrations_v8.sql` | Tabla `pomodoro_sessions` (versión actualizada) |
| `supabase/migrations_v9.sql` | Smart deadline alerts: columnas `event_id`, `subject_id`, `trigger_days_before`, `title`, `body`, `context_json`, `push_sent`, `target_path` en `notifications` + nuevo UNIQUE constraint |
| `supabase/migrations_features456.sql` | **Features 4-5-6:** tablas `topic_completions` (detección de alucinación) y `progress_snapshots` (heatmap de dominio) con RLS e índices |
| `supabase/migration_resources.sql` | Tabla `subject_resources` (recursos/links por materia) con RLS e índices — el backend existe aunque la UI fue eliminada |
| `supabase/migration_grades.sql` | Tabla `grades` para calificaciones por materia con RLS e índices |

```sql
-- Verificar tablas tras todas las migraciones:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Debe incluir: academic_events, checkins, class_logs, class_schedule,
--               daily_plans, grades, notifications, pomodoro_sessions, profiles,
--               progress_snapshots, push_subscriptions, semesters, subject_resources,
--               subjects, topic_completions, topics, travel_logs, units,
--               user_config, user_integrations, workouts
```

### 4.4 Configurar Auth

En Supabase Dashboard → **Authentication** → **Settings**:

```
Site URL:
  http://localhost:3000          ← development
  https://iamentor.vercel.app    ← production

Redirect URLs:
  http://localhost:3000/**
  https://iamentor.vercel.app/**
```

El **Email provider** viene habilitado por defecto. Verificar que esté activo.

### 4.5 Copiar las keys al .env.local

Settings → API:
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` → `SUPABASE_SERVICE_ROLE_KEY`

> El formato de las keys en Supabase v2+ es `sb_publishable_...` y `sb_secret_...`.
> Si ves el formato antiguo (`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`), actualizar el dashboard de Supabase.

---

## 5. Configuración de Google OAuth (Calendar)

> La app funciona completamente sin esto. Solo necesario para sincronizar eventos de Google Calendar en el plan diario.

### 5.1 Crear proyecto en Google Cloud

1. Ir a [console.cloud.google.com](https://console.cloud.google.com)
2. Crear nuevo proyecto (ej: `iamentor`)
3. Habilitar **Google Calendar API**:
   - APIs & Services → Library → buscar "Google Calendar API" → **Enable**

### 5.2 Crear credenciales OAuth2

1. APIs & Services → Credentials → **Create Credentials** → OAuth 2.0 Client ID
2. Application type: **Web application**
3. Authorized redirect URIs — agregar AMBAS:
   ```
   http://localhost:3000/api/calendar/callback
   https://iamentor.vercel.app/api/calendar/callback
   ```
4. Copiar `Client ID` → `GOOGLE_CLIENT_ID` y `Client Secret` → `GOOGLE_CLIENT_SECRET`

### 5.3 Configurar OAuth Consent Screen

1. APIs & Services → **OAuth consent screen**
2. User Type: **External** (para uso personal/testing)
3. App name: `Mentor IA Personal`
4. Scopes requeridos:
   - `https://www.googleapis.com/auth/calendar.events.readonly`
   - `https://www.googleapis.com/auth/userinfo.email`
5. Test users: Agregar el email de tu cuenta Google

> Mientras la app esté en modo "Testing", solo los emails en la lista de Test Users pueden conectar Google Calendar.
> Para uso en producción con múltiples usuarios, solicitar verificación en Google.

---

## 6. Configuración de Anthropic (Claude API)

1. Ir a [console.anthropic.com](https://console.anthropic.com)
2. **API Keys** → Create Key
3. Copiar la key → `ANTHROPIC_API_KEY` en `.env.local`

**Modelo usado:** `claude-sonnet-4-5`

**Costo estimado por operación:**
- Generación del plan diario: ~$0.01–0.05 (depende del tamaño del contexto)
- Replanificación: ~$0.01–0.03
- Resumen semanal: ~$0.005
- Parsing de PDF: ~$0.02–0.10 (depende del tamaño del archivo)

> Recomendado: configurar un límite de gasto mensual en la consola de Anthropic.

---

## 7. Configuración de Web Push (Notificaciones)

> Opcional para desarrollo básico. Requerido en producción para recibir alertas de parciales y TPs.

### 7.1 Generar claves VAPID

```bash
npx web-push generate-vapid-keys
```

Output:
```
Public Key:
Bxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Private Key:
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Copiar al `.env.local`:
```bash
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<clave pública>
VAPID_PRIVATE_KEY=<clave privada>
VAPID_MAILTO=mailto:tu@email.com
```

> **Las claves VAPID son permanentes por proyecto.** Cambiarlas invalida TODAS las suscripciones existentes — todos los usuarios deberán volver a suscribirse desde `/settings`.

### 7.2 Service Worker

El archivo `public/push-sw.js` ya está incluido en el repo. Maneja el evento `push` en el Service Worker. No requiere configuración adicional.

### 7.3 Activar notificaciones en la app

1. Abrir `/settings` en la app
2. Sección "Notificaciones" → activar el toggle
3. El browser solicita permiso de notificaciones del sistema
4. Al aceptar, la suscripción se registra en la tabla `push_subscriptions`

### 7.4 Flujo interno de push

```
GET /api/notifications
  → detecta deadline alert nueva
  → POST /api/push/send (con X-Internal-Secret header)
    → web-push.sendNotification(subscription, payload)
      → Service Worker recibe evento 'push'
        → muestra notificación nativa del SO
```

---

## 8. Desarrollo local

### Iniciar el servidor de desarrollo

```bash
# Opción A — RECOMENDADA en Windows (evita problemas con npm.cmd)
node node_modules/next/dist/bin/next dev

# Opción B — si npm funciona en tu shell
npm run dev

# La app estará disponible en: http://localhost:3000
```

### Comandos npm disponibles

```bash
npm run dev      # Servidor de desarrollo en puerto 3000
npm run build    # Build de producción (genera .next/)
npm run start    # Servidor de producción local (requiere build previo)
npm run lint     # ESLint (desactivado en build por next.config.js)
```

> **Nota:** `next-pwa` está desactivado en desarrollo (`disable: process.env.NODE_ENV === 'development'`).
> El Service Worker y las notificaciones push solo funcionan en el build de producción.

---

## 9. Primer usuario y seed de datos

### 9.1 Registrar el primer usuario

1. Abrir `http://localhost:3000/login`
2. Click en **"Registrarse"**
3. Ingresar email + contraseña (mínimo 8 chars, 1 mayúscula, 1 dígito, 1 símbolo)
4. La app redirige automáticamente al onboarding

### 9.2 Onboarding (wizard 4 pasos)

| Paso | Qué configura | Tabla afectada |
|------|---------------|----------------|
| 1. Bienvenida | Pantalla introductoria | — |
| 2. Trabajo | Días laborales, horario entrada/salida, modalidad. Si el usuario no trabaja → marcar `is_employed=false` (omite el paso de trabajo en el check-in diario) | `user_config` |
| 3. Cuatrimestre | Nombre, fechas inicio y fin | `semesters` |
| 4. Materias | Agregar materias con nombre y color | `subjects` |

### 9.3 Cargar el seed de datos de ejemplo (opcional)

Para empezar con 4 materias, 17 unidades y 65+ temas pre-cargados:

1. Ir a **Supabase Dashboard** → Authentication → Users
2. Copiar el UUID del usuario
3. SQL Editor → Nueva query:

```sql
SELECT seed_initial_data('PEGAR-UUID-AQUI');
```

Esto carga:
- **Química Básica** — estequiometría, enlace químico, equilibrio, termodinámica
- **Anatomía e Histología** — células, tejidos, histología de órganos
- **Física de Partículas** — mecánica, electromagnetismo, ondas
- **Algoritmos y Programación** — variables, control de flujo, estructuras, POO

### 9.4 Completar la configuración inicial

Después del onboarding, configurar lo siguiente:

| Ruta | Qué configurar |
|------|---------------|
| `/settings/classes` | Horario de cursada semanal (qué materia, qué día, qué hora) |
| `/settings/semesters` | Verificar que el cuatrimestre activo es correcto |
| `/settings/work` | Horario laboral y modalidad por defecto |
| `/subjects/[id]` | Agregar parciales, TPs y fechas de entrega por materia |

### 9.5 Conectar Google Calendar (opcional)

1. `/settings` → sección Google Calendar → **Conectar**
2. Completar el flujo OAuth
3. Los eventos de Google Calendar aparecerán como contexto en el plan diario

---

## 10. Tests E2E

### 10.1 Prerequisitos

- El servidor de desarrollo debe estar corriendo en `http://localhost:3000`
- Las variables de entorno deben incluir `SUPABASE_SERVICE_ROLE_KEY` (requiere permisos de Admin API)

### 10.2 Ejecutar la suite

```bash
# Desde la raíz del proyecto
node node_modules/ts-node/dist/bin.js --project tests/tsconfig.json tests/e2e-flow.ts
```

### 10.3 Qué hace la suite (9 pasos, 23 checks)

| Paso | Descripción |
|------|-------------|
| 1 | Limpia usuario test previo (si existe) + crea usuario nuevo vía Admin API |
| 2 | Inserta `user_config` (días laborales lun-vie, 9:00–18:00, presencial) |
| 3 | Inserta `class_schedule` (4 clases en distintos días de la semana) |
| 4 | Inserta `academic_events`: parcial Química en 10 días, TP Algoritmos en 5 días |
| 5 | Inserta check-in con `travel_route_json` de 3 segmentos (120 min total) |
| 6 | Llama a `POST /api/ai/plan` y valida los bloques devueltos |
| 7 | Actualiza estados de temas: Algoritmos → yellow, Química → red |
| 8 | Inserta workout de tipo 'empuje' con ejercicios y esfuerzo percibido |
| 9 | Reporte final + limpieza automática si todos los checks pasan |

### 10.4 Checks validados en el Paso 6 (generación del plan)

- El plan retorna un array de bloques (no vacío)
- Incluye bloque de **TRABAJO** (solo en días laborales configurados)
- Incluye bloque de **ESTUDIO** (generado por Claude)
- Incluye bloque de **VIAJE** (inyectado determinísticamente desde `travel_route_json`)
- Incluye bloque de **CLASE** (en días con clase configurada)
- El estudio prioriza **ALGORITMOS** (TP en 5 días → urgencia máxima)
- Si hay 2+ bloques de estudio: también prioriza **QUÍMICA** (parcial en 10 días)

### 10.5 Idempotencia

La suite es completamente idempotente:
- El Paso 1 detecta y elimina el usuario de test anterior antes de crear uno nuevo
- Si todos los 23 checks pasan, el usuario de test se limpia automáticamente al final
- Si fallan, el usuario queda en DB para inspección manual

---

## 11. Deploy en Vercel

### 11.1 Instalar Vercel CLI

```bash
npm install -g vercel
vercel --version   # Verificar instalación
```

### 11.2 Login y link del proyecto

```bash
# Login (abre browser para autenticación)
vercel login

# Linkear el directorio local al proyecto en Vercel
vercel link --yes
# Seleccionar tu scope y el proyecto existente, o crear uno nuevo
```

### 11.3 Cargar variables de entorno en Vercel

**Opción A — Vercel Dashboard (recomendada):**
- Settings → Environment Variables → agregar cada variable

**Opción B — CLI:**
```bash
echo "https://TU-ID.supabase.co"      | vercel env add NEXT_PUBLIC_SUPABASE_URL production
echo "sb_publishable_XXX"              | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
echo "sb_secret_XXX"                   | vercel env add SUPABASE_SERVICE_ROLE_KEY production
echo "sk-ant-api03-XXX"                | vercel env add ANTHROPIC_API_KEY production
echo "XXX.apps.googleusercontent.com"  | vercel env add GOOGLE_CLIENT_ID production
echo "GOCSPX-XXX"                      | vercel env add GOOGLE_CLIENT_SECRET production
echo "BxxxxxxXXXXXX..."                | vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production
echo "xxxxxxXXXXXX..."                 | vercel env add VAPID_PRIVATE_KEY production
echo "mailto:admin@mentoria.app"       | vercel env add VAPID_MAILTO production
echo "https://iamentor.vercel.app"     | vercel env add NEXTAUTH_URL production
echo "https://iamentor.vercel.app"     | vercel env add NEXT_PUBLIC_BASE_URL production
echo "tu_internal_secret_aqui"         | vercel env add INTERNAL_SECRET production
echo "tu_cron_secret_aqui"             | vercel env add CRON_SECRET production
echo "https://TU.upstash.io"          | vercel env add UPSTASH_REDIS_REST_URL production
echo "tu_upstash_token_aqui"          | vercel env add UPSTASH_REDIS_REST_TOKEN production
```

> **Rate limiting (Upstash):** Instalar con `npm install @upstash/ratelimit @upstash/redis`. Si las variables de Upstash no están configuradas, el rate limiting falla gracefully (deja pasar todas las requests).

> **Vercel Cron:** El archivo `vercel.json` ya incluye el schedule `0 9 * * *` (06:00 UTC-3). El Cron Job se activará automáticamente al hacer deploy. Requiere `CRON_SECRET` y `SUPABASE_SERVICE_ROLE_KEY`.

### 11.4 Deploy a producción

```bash
vercel --prod --yes
```

El build tarda ~2-3 minutos. Al finalizar imprime la URL de producción.

### 11.5 Post-deploy: actualizar URLs en servicios externos

**Supabase** → Authentication → Settings:
```
Site URL:     https://iamentor.vercel.app
Redirect URLs: https://iamentor.vercel.app/**
```

**Google Cloud Console** → Credentials → OAuth Client → Authorized redirect URIs:
```
https://iamentor.vercel.app/api/calendar/callback
```

### 11.6 Re-deploy (actualizaciones)

```bash
vercel --prod --yes
```

---

## 12. Hard reset de base de datos

Para limpiar todos los datos manteniendo la estructura completa (tablas, índices, RLS, funciones):

```bash
node node_modules/ts-node/dist/bin.js --project tests/tsconfig.json scripts/db-reset.ts
```

**Qué elimina:**
- Todos los usuarios de `auth.users` (vía Admin API)
- Todas las filas de todas las tablas de aplicación

**Qué preserva:**
- Estructura de todas las tablas
- Índices y constraints
- Políticas RLS
- Función `seed_initial_data()`

> **Esta operación es irreversible.** Úsarla solo en desarrollo o antes de un lanzamiento limpio.

---

## 13. Comandos de referencia rápida

```bash
# ── Desarrollo ──────────────────────────────────────────────────
node node_modules/next/dist/bin/next dev     # Dev server (Windows-safe)
npm run build                                 # Build producción
npm run lint                                  # ESLint

# ── Tests ───────────────────────────────────────────────────────
node node_modules/ts-node/dist/bin.js \
  --project tests/tsconfig.json \
  tests/e2e-flow.ts                           # Suite E2E completa (23 checks)

# ── Scripts de DB ────────────────────────────────────────────────
node node_modules/ts-node/dist/bin.js \
  --project tests/tsconfig.json \
  scripts/db-reset.ts                         # Hard reset de DB (irreversible)

# ── VAPID Keys ──────────────────────────────────────────────────
npx web-push generate-vapid-keys              # Genera claves para push notifications

# ── Vercel ──────────────────────────────────────────────────────
vercel whoami                                 # Verificar sesión
vercel env ls                                 # Listar env vars del proyecto
vercel --prod --yes                           # Deploy a producción
vercel logs <URL>                             # Ver logs del último deploy
vercel inspect <URL> --logs                   # Logs detallados de functions

# ── Supabase (SQL Editor) ────────────────────────────────────────
SELECT seed_initial_data('UUID');             # Cargar datos de ejemplo
SELECT * FROM user_config WHERE user_id = 'UUID';
SELECT count(*) FROM topics;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

---

## 14. Troubleshooting

### Error: `SUPABASE_URL is required` o `supabaseUrl is required`
Las variables de entorno no están cargadas. Verificar:
1. El archivo `.env.local` existe en la **raíz** del proyecto (no en subcarpetas)
2. Las variables tienen el nombre exacto (distingue mayúsculas)
3. Reiniciar el servidor de desarrollo tras modificar `.env.local`

---

### Error: `npm run dev` falla en Windows / Git Bash
El `npm.cmd` a veces falla en Git Bash en Windows. Solución:
```bash
node node_modules/next/dist/bin/next dev
```

---

### Error: `A user with this email address has already been registered` (tests)
El usuario de test anterior no fue limpiado. El Paso 1 de la suite maneja esto automáticamente.
Si persiste, eliminarlo manualmente en Supabase → Authentication → Users.

---

### Error: `SyntaxError: missing ) after argument list` al correr tests
El shim de `ts-node` en `.bin/` no funciona en Git Bash de Windows. Usar:
```bash
node node_modules/ts-node/dist/bin.js --project tests/tsconfig.json tests/e2e-flow.ts
```

---

### Error: `Route /api/calendar/events couldn't be rendered statically`
Este warning aparece durante el build de Vercel pero **no es un error real**. Indica que la ruta usa cookies dinámicamente, lo cual es correcto. El build y deploy continúan normalmente.

---

### El check-in no muestra el paso de "Trabajo"
Este es el **comportamiento esperado** si el usuario marcó `is_employed=false` durante el onboarding.
Para restaurar el paso: ir a `/settings/work` → activar la opción de empleo.

---

### El selector de materias en el check-in está vacío
El usuario no tiene materias cargadas en el cuatrimestre activo.
Solución:
1. Ir a `/settings/semesters` y verificar que existe un cuatrimestre activo
2. Si no hay materias, agregarlas desde el mismo cuatrimestre o desde `/subjects`

---

### El plan IA no incluye bloques de viaje
Los bloques de viaje son determinísticos (no los genera Claude). Se generan a partir de `checkin.travel_route_json`.
Si el array está vacío o el check-in del día no tiene viaje configurado → no hay bloques de viaje.
Solución: hacer un nuevo check-in incluyendo la ruta de viaje en el Paso 4.

---

### La integración de Google Calendar no funciona
1. Verificar que `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` están en `.env.local`
2. Verificar que la URL de redirect está agregada en Google Cloud Console:
   - Dev: `http://localhost:3000/api/calendar/callback`
   - Prod: `https://iamentor.vercel.app/api/calendar/callback`
3. Verificar que tu email está en la lista de "Test Users" del OAuth Consent Screen
4. Reconectar desde `/settings` → Google Calendar → Conectar

---

### Las notificaciones push no llegan

1. Verificar que `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` están en `.env.local` y en Vercel
2. Verificar que el dispositivo tiene permiso de notificaciones concedido (Configuración del SO → Notificaciones)
3. En **iOS**, las push solo funcionan desde Safari y con la app instalada como PWA en pantalla de inicio
4. Verificar que la tabla `push_subscriptions` existe en Supabase (requiere `migrations_v6.sql`)
5. Si se cambiaron las claves VAPID, todos los usuarios deben volver a suscribirse desde `/settings`
6. Verificar que `INTERNAL_SECRET` está configurado tanto en `.env.local` como en Vercel (lo usa `/api/push/send`)

---

### El heatmap de dominio no muestra datos

El heatmap necesita al menos un snapshot en `progress_snapshots`. Se crea automáticamente al visitar `/stats`, pero si la tabla no existe la UI muestra "Sin datos disponibles".

Verificar:
1. Ejecutar `supabase/migrations_features456.sql` en Supabase SQL Editor
2. Visitar `/stats` — el Server Component hace upsert automático
3. Si la tabla existe pero sigue vacío, ir a `/stats` y hacer clic en "↻ actualizar" en la tarjeta del heatmap

---

### El desafío de alucinación de progreso no aparece

La detección requiere la tabla `topic_completions`. Si la tabla no existe, el endpoint devuelve 500 y el error se silencia en el cliente (la UI no bloquea el flujo).

Verificar:
1. Ejecutar `supabase/migrations_features456.sql`
2. Reproducir el trigger: marcar > 3 temas como verdes en menos de 2 horas

---

### La pantalla de gym no muestra el banner de "Semana de parciales"

El banner solo aparece si hay `academic_events` con `type` en `('parcial', 'parcial_intermedio', 'entrega_tp')` en los próximos 14 días para el usuario.

Verificar:
1. Ir a una materia → agregar un parcial con fecha dentro de los próximos 7 días
2. Recargar `/gym` — el Server Component recalcula `studyMode` en cada request

---

### El build de Vercel falla con errores de TypeScript o ESLint
El `next.config.js` tiene ambas opciones desactivadas durante el build. Verificar que sigue presente:
```javascript
eslint: { ignoreDuringBuilds: true },
typescript: { ignoreBuildErrors: true },
```
Si reaparecen errores de otro tipo, ver los logs con `vercel logs <URL>`.

---

### La app no se instala como PWA en iOS
En iOS la instalación PWA solo funciona desde **Safari** (Chrome y Firefox en iOS no soportan Service Workers).
1. Abrir la URL en Safari
2. Tocar el botón de compartir (cuadrado con flecha hacia arriba)
3. Seleccionar "Añadir a pantalla de inicio"
4. Confirmar con "Añadir"

---

### Error: `sb_publishable_` o `sb_secret_` no reconocidos
Estos son los formatos de Supabase v2+. Si el proyecto fue creado antes de 2024, puede tener las keys en formato JWT largo.
Ambos formatos funcionan — solo asegurarse de copiar la key completa sin espacios.

---

## 15. Archivos de configuración importantes

| Archivo | Propósito |
|---------|-----------|
| `.env.local` | Variables de entorno secretas — **gitignored, nunca commitear** |
| `next.config.js` | Config Next.js: PWA, ignoreBuildErrors, ignoreDuringBuilds |
| `tailwind.config.ts` | Design tokens: background, surface, primary, etc. |
| `middleware.ts` | Auth guard SSR — protege rutas `/app/*`, redirige a `/login` |
| `supabase/schema.sql` | Schema base: tablas, RLS, índices, función `seed_initial_data()` |
| `supabase/migrations_v3.sql` | `profiles`, `user_config`, `class_schedule`, `notifications` |
| `supabase/migrations_v4.sql` | `class_logs.topics_covered_json` |
| `supabase/migrations_v5.sql` | `class_logs.due_date` |
| `supabase/migrations_v6.sql` | `push_subscriptions`, `user_config.is_employed`, dedup notifications |
| `supabase/migrations_v7.sql` | `pomodoro_sessions` (v1) |
| `supabase/migrations_v8.sql` | `pomodoro_sessions` (versión actualizada) |
| `supabase/migrations_v9.sql` | Smart deadline alerts en `notifications` |
| `supabase/migrations_features456.sql` | `topic_completions` + `progress_snapshots` (Features 4, 5, 6) |
| `supabase/migration_resources.sql` | `subject_resources` — tabla de recursos/links por materia (backend activo, UI eliminada) |
| `supabase/migration_grades.sql` | `grades` — calificaciones por materia |
| `vercel.json` | Vercel Cron schedule: `0 9 * * *` para pre-generación del plan a las 06:00 UTC-3 |
| `lib/anthropic.ts` | Funciones `generateDailyPlan()`, `replanDay()`, `generateWeeklyInsight()` |
| `lib/study-priority.ts` | Algoritmo puro de priorización (sin DB, testeable) |
| `lib/fixed-blocks.ts` | `buildFixedBlocks()` — bloques determinísticos reutilizables en plan y replan |
| `lib/rate-limit.ts` | Helper Upstash ratelimit con fallback graceful si env vars ausentes |
| `lib/offline-queue.ts` | Cola localStorage para mutaciones offline + sync al reconectar |
| `lib/notifications-engine.ts` | Motor puro de triggers de notificaciones (sin DB, testeable) |
| `lib/exercises.ts` | 48 ejercicios + `getWorkoutPlan(type, energy, week, effort, studyMode?)` + `getNextWorkoutType()` |
| `lib/google-calendar.ts` | OAuth + fetch de eventos + refresh automático de token |
| `public/push-sw.js` | Service Worker para push notifications |
| `public/manifest.json` | PWA manifest con shortcuts para Android |
| `worker/index.js` | Service Worker custom mergeado por next-pwa |
| `hooks/usePushNotifications.ts` | Hook React para gestionar suscripción push |
| `lib/push.ts` | Helpers `web-push` para enviar notificaciones desde server |
| `tests/e2e-flow.ts` | Suite E2E: 9 pasos, 23 checks, idempotente |
| `tests/tsconfig.json` | Config TypeScript específica para tests y scripts |
| `scripts/db-reset.ts` | Hard reset de todas las tablas (irreversible) |
| `.vercel/project.json` | Link del proyecto a Vercel (no commitear si es repositorio privado) |

---

## 16. Flujos principales de uso

Esta sección describe los dos flujos de registro más frecuentes de la app una vez que el setup está completo. Para la documentación técnica detallada ver [README.md §22](README.md#22-flujo-de-post-clase) y [README.md §23](README.md#23-flujo-de-fechas-importantes).

---

### 16.1 Cargar un Post-clase

Registrar una clase que acaba de ocurrir: qué temas se vieron, cuánto se entendió, y si quedó tarea pendiente.

**Opción A — Desde el FAB (botón flotante +)**

1. Tocar el botón **+** (esquina inferior derecha) → seleccionar **"Post-clase"**
2. La app sugiere automáticamente la materia más frecuente en ese día de la semana (basado en historial). Si es incorrecta, cambiarla con el selector.
3. Desplegar las **unidades** del temario haciendo clic en cada acordeón → seleccionar los temas vistos en clase (chips azules = seleccionados).
   - Se puede tocar **"Seleccionar todos"** para marcar toda una unidad de un golpe.
   - Si falta un tema en la lista, usar **"Agregar tema"** (inline, sin salir del modal).
4. Elegir el **nivel de comprensión** con los 5 emojis.
5. Si quedó tarea o TP: activar el **toggle "Quedó tarea / TP"** → completar descripción y fecha de entrega.
   - Si la materia tiene parciales o TPs futuros cargados, aparece el selector **"Relacionar con fecha existente"**: al vincularlo, la fecha de entrega se completa automáticamente y no se crea un evento duplicado.
   - Si no se vincula y se carga una fecha → se crea automáticamente un evento de tipo `entrega_tp`.
6. Tocar **"Guardar clase"**. Los temas seleccionados que estaban en rojo pasan a amarillo automáticamente.

**Opción B — Desde la pantalla de la materia**

1. Ir a **Materias** → tocar la materia → botón **"Registrar clase de hoy"**
2. El flujo es idéntico al FAB, con la diferencia de que la materia ya está pre-seleccionada y es posible cargar clases de días anteriores cambiando la fecha.
3. Si ya existe un log para la fecha seleccionada, el modal lo carga para edición en lugar de crear uno nuevo.

---

### 16.2 Cargar una Fecha Importante

Registrar un parcial, TP, turno médico o evento personal en el calendario.

**Opción A — Desde el FAB (botón flotante +)**

1. Tocar **+** → seleccionar **"Fecha importante"**
2. Completar:
   - **Título** (ej: "Parcial Física II")
   - **Fecha** (date picker)
   - **Tipo**: Parcial / Parcial Intermedio / Entrega TP / Turno médico / Evento personal
3. Para tipos académicos (parcial, parcial_int, entrega_tp):
   - Seleccionar la **materia** con el selector
   - Opcionalmente marcar los **temas del temario** que cubre el evento (acordeón por unidades)
   - Opcionalmente agregar **hora** y **aula**
4. Tocar **"Guardar evento"**. El evento aparece en la agenda, el calendario y la pantalla de la materia.

**Opción B — Desde la pantalla de la materia**

1. Ir a **Materias** → tocar la materia → sección **"Fechas importantes"** → botón **"Nueva fecha"**
2. La materia ya está pre-seleccionada
3. Mismos campos que el FAB (tipo, título, fecha, temas, hora, aula)

**Editar o eliminar un evento existente**

Desde cualquier vista (agenda, calendario o pantalla de materia), tocar el evento para abrir **EditEventModal**:
- Modificar cualquier campo y guardar → el cambio se refleja en todas las vistas de forma optimista (sin recarga completa)
- **Eliminar** → se borra el evento
- **Duplicar** → se crea una copia que se agrega al estado local inmediatamente

---

### 16.3 Registrar una Calificación

Registrar la nota obtenida en un parcial, recuperatorio o entrega de TP.

1. Ir a **Calificaciones** (menú lateral, bajo "Estudio")
2. Tocar **"Registrar"** (botón en el header — solo aparece si hay materias activas con fechas cargadas)
3. **Paso 1 — Elegí la materia:** seleccionar la materia del examen (solo se muestran materias del cuatrimestre activo)
4. **Paso 2 — Elegí el examen:** se muestran todas las fechas importantes. Las del subject seleccionado aparecen primero; las de otras materias debajo bajo "Otras fechas". Las que ya tienen nota muestran el score.
5. **Paso 3 — Registrar resultado:**
   - Ingresar la nota (campo numérico, 0–10, opcional)
   - Si la nota es **< 4 (desaprobado)**: aparece una sección roja que pregunta la fecha del recuperatorio. Si se completa, el recuperatorio se crea automáticamente en "Fechas importantes" de la materia.
6. Tocar **"Guardar"**.

> La nota ingresada también aparece en la card del evento dentro de la pantalla de la materia, reemplazando el badge de días restantes.

> Para editar una nota ya registrada: repetir el flujo, seleccionar el mismo evento — el score se pre-carga y al guardar se actualiza (PATCH).

---

### 16.4 Verificar que los flujos funcionan correctamente

Checklist rápido post-setup:

```
□ Tenés al menos 1 cuatrimestre activo en /settings/semesters
□ Tenés al menos 1 materia con unidades y temas cargados en /subjects/[id]
□ El FAB (+) es visible en todas las pantallas excepto /checkin
□ Post-clase: los temas seleccionados aparecen en el acordeón de la materia
□ Post-clase con tarea: el evento aparece en /agenda con tipo "Entrega TP"
□ Fecha importante: el evento aparece en /agenda y en /calendar
□ Fecha importante: los días restantes aparecen en el badge (rojo < 7 días)
□ Editar evento desde /agenda: los cambios persisten al navegar a /calendar
□ Calificaciones: al ingresar nota < 4 aparece la opción de recuperatorio
□ Calificaciones: la nota registrada se muestra en la card del evento dentro de la materia
```

> **Nota sobre materias inactivas o eliminadas:** el FAB y la página de Calificaciones solo muestran materias del cuatrimestre activo. Si una materia no aparece, verificar que el cuatrimestre correcto está marcado como activo en `/settings/semesters`.
