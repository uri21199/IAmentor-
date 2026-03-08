# Mentor IA Personal — Guía de Setup

Guía completa para levantar el proyecto desde cero en local y desplegarlo en producción.

---

## Tabla de contenidos

1. [Prerequisitos](#1-prerequisitos)
2. [Variables de entorno](#2-variables-de-entorno)
3. [Instalación local](#3-instalación-local)
4. [Configuración de Supabase](#4-configuración-de-supabase)
5. [Configuración de Google OAuth (Calendar)](#5-configuración-de-google-oauth-calendar)
6. [Configuración de Anthropic (Claude API)](#6-configuración-de-anthropic-claude-api)
7. [Desarrollo local](#7-desarrollo-local)
8. [Primer usuario y seed de datos](#8-primer-usuario-y-seed-de-datos)
9. [Tests E2E](#9-tests-e2e)
10. [Deploy en Vercel](#10-deploy-en-vercel)
11. [Hard reset de base de datos](#11-hard-reset-de-base-de-datos)
12. [Comandos de referencia rápida](#12-comandos-de-referencia-rápida)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Prerequisitos

| Herramienta | Versión mínima | Notas |
|-------------|----------------|-------|
| Node.js | 18.x o 20.x | [nodejs.org](https://nodejs.org) |
| npm | 9.x+ | Viene con Node.js |
| Git | Cualquiera | Para clonar el repo |
| Cuenta Supabase | — | [supabase.com](https://supabase.com) — plan Free alcanza para dev |
| Cuenta Anthropic | — | [console.anthropic.com](https://console.anthropic.com) |
| Cuenta Google Cloud | — | Solo si querés integración de Calendar |
| Cuenta Vercel | — | Solo para deploy en producción |

---

## 2. Variables de entorno

Crear el archivo `.env.local` en la raíz del proyecto con estas variables:

```bash
# ── Supabase ───────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROJECT-ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_XXXXXXXXXXXXXXXXXX
SUPABASE_SERVICE_ROLE_KEY=sb_secret_XXXXXXXXXXXXXXXXXX

# ── Anthropic (Claude API) ─────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-api03-XXXXXXXXXXXXXXXXXXXXXXXX

# ── Google Calendar OAuth ──────────────────────────────────
GOOGLE_CLIENT_ID=XXXXXXXXXX.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-XXXXXXXXXXXXXXXXXXXXXXXX

# ── App URL (cambiar en producción) ───────────────────────
NEXTAUTH_URL=http://localhost:3000
```

### Dónde conseguir cada variable

| Variable | Dónde encontrarla |
|----------|-------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → `anon public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → `service_role` key (**secreto**) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → APIs → Credentials → OAuth 2.0 Client |
| `GOOGLE_CLIENT_SECRET` | Mismo lugar que el Client ID |

> **Importante:** `.env.local` está en `.gitignore`. Nunca commitear este archivo.

---

## 3. Instalación local

```bash
# 1. Clonar el repositorio
git clone <URL-DEL-REPO> IAmentor
cd IAmentor

# 2. Instalar dependencias
npm install

# 3. Crear archivo de variables de entorno
cp .env.local.example .env.local
# Editar .env.local con tus credenciales
```

> **Nota para Windows:** `npm.cmd` puede fallar en ciertas configuraciones de shell.
> Usar siempre `node node_modules/next/dist/bin/next dev` como alternativa.

---

## 4. Configuración de Supabase

### 4.1 Crear el proyecto

1. Ir a [supabase.com](https://supabase.com) → New Project
2. Elegir nombre del proyecto (ej: `iamentor`)
3. Elegir región (recomendado: South America / sa-east-1 para Argentina)
4. Guardar la contraseña de la DB

### 4.2 Ejecutar el schema principal

1. En el dashboard de Supabase → SQL Editor
2. Copiar el contenido de `supabase/schema.sql`
3. Ejecutar (crear todas las tablas, RLS, función seed)

```sql
-- Verificar que se crearon las tablas:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Esperado: semesters, subjects, units, topics, academic_events,
--           checkins, daily_plans, class_logs, workouts,
--           travel_logs, user_integrations
```

### 4.3 Ejecutar la migración v3

1. En SQL Editor → Nueva query
2. Copiar el contenido de `supabase/migrations_v3.sql`
3. Ejecutar (crea `profiles`, `user_config`, `class_schedule`, `notifications`)

```sql
-- Verificar tablas adicionales:
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN
  ('profiles', 'user_config', 'class_schedule', 'notifications');
-- Debe devolver 4 filas
```

### 4.4 Configurar Auth

En Supabase Dashboard → Authentication → Settings:

```
Site URL:             http://localhost:3000          (dev)
                      https://iamentor.vercel.app    (prod)

Redirect URLs:        http://localhost:3000/**
                      https://iamentor.vercel.app/**
```

Habilitar **Email** provider (viene habilitado por defecto).

### 4.5 Copiar las keys al .env.local

Settings → API → copiar:
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` → `SUPABASE_SERVICE_ROLE_KEY`

---

## 5. Configuración de Google OAuth (Calendar)

> Solo necesario si querés la integración con Google Calendar. La app funciona sin esto.

### 5.1 Crear proyecto en Google Cloud

1. Ir a [console.cloud.google.com](https://console.cloud.google.com)
2. Crear nuevo proyecto (ej: `iamentor`)
3. Habilitar **Google Calendar API**:
   - APIs & Services → Library → buscar "Google Calendar API" → Enable

### 5.2 Crear credenciales OAuth2

1. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
2. Application type: **Web application**
3. Authorized redirect URIs:
   ```
   http://localhost:3000/api/calendar/callback      (desarrollo)
   https://iamentor.vercel.app/api/calendar/callback (producción)
   ```
4. Copiar el `Client ID` y `Client Secret` al `.env.local`

### 5.3 Configurar OAuth Consent Screen

1. APIs & Services → OAuth consent screen
2. User Type: **External** (para uso personal)
3. App name: `Mentor IA Personal`
4. Scopes: `https://www.googleapis.com/auth/calendar.events.readonly`
5. Test users: Agregar tu email

---

## 6. Configuración de Anthropic (Claude API)

1. Ir a [console.anthropic.com](https://console.anthropic.com)
2. API Keys → Create Key
3. Copiar la key al `.env.local` como `ANTHROPIC_API_KEY`

> **Modelo usado:** `claude-sonnet-4-5`
> **Costo estimado:** ~$0.01–0.05 por generación de plan (depende del contexto)

---

## 7. Desarrollo local

### Iniciar el servidor de desarrollo

```bash
# Opción A (recomendada en Windows)
node node_modules/next/dist/bin/next dev

# Opción B
npm run dev

# La app estará en: http://localhost:3000
```

### Estructura de comandos disponibles

```bash
npm run dev      # Servidor de desarrollo (puerto 3000)
npm run build    # Build de producción (genera .next/)
npm run start    # Servidor de producción local
npm run lint     # ESLint (nota: desactivado en build)
```

> **Nota:** `next-pwa` está desactivado en desarrollo (`disable: NODE_ENV === 'development'`).
> El Service Worker solo se activa en el build de producción.

---

## 8. Primer usuario y seed de datos

### 8.1 Registrar el primer usuario real

1. Abrir `http://localhost:3000/login`
2. Hacer click en **"Registrarse"**
3. Ingresar email y contraseña
4. La app redirige automáticamente a `/onboarding`

### 8.2 Onboarding (wizard 4 pasos)

| Paso | Qué configura |
|------|---------------|
| 1. Bienvenida | Pantalla inicial |
| 2. Trabajo | Días laborales, horario entrada/salida, modalidad |
| 3. Cuatrimestre | Nombre, fechas inicio y fin del cuatrimestre |
| 4. Materias | Agregar materias con nombre y color |

### 8.3 Cargar el seed de datos de ejemplo (opcional)

Si querés empezar con 4 materias y 69 temas pre-cargados:

1. Ir a Supabase Dashboard → Authentication → Users
2. Copiar el UUID del usuario recién creado
3. SQL Editor → Ejecutar:

```sql
SELECT seed_initial_data('PEGAR-UUID-AQUI');
```

Esto carga:
- 4 materias: Química Básica, Anatomía e Histología, Física de Partículas, Algoritmos y Programación
- 17 unidades temáticas
- 69 temas individuales

### 8.4 Cargar clases del cuatrimestre (Settings)

Después del onboarding, ir a `/settings` para agregar:
- Clases fijas por día de la semana
- Fechas de parciales, TPs y exámenes

---

## 9. Tests E2E

### 9.1 Prerequisitos

- El servidor de desarrollo debe estar corriendo en `http://localhost:3000`
- Las variables de entorno deben incluir `SUPABASE_SERVICE_ROLE_KEY`

### 9.2 Ejecutar la suite

```bash
# Desde la raíz del proyecto
node node_modules/ts-node/dist/bin.js --project tests/tsconfig.json tests/e2e-flow.ts
```

### 9.3 Qué hace la suite (9 pasos, 23 checks)

| Paso | Descripción |
|------|-------------|
| 1 | Limpia usuario test previo + crea usuario nuevo vía Admin API |
| 2 | Inserta `user_config` (horario laboral) |
| 3 | Inserta `class_schedule` (4 clases en distintos días) |
| 4 | Inserta `academic_events` (parcial Química en 10 días, TP Algoritmos en 5 días) |
| 5 | Inserta check-in con travel_route_json (3 segmentos, 120 min total) |
| 6 | Llama a `POST /api/ai/plan` y valida bloques devueltos |
| 7 | Actualiza estados de temas (Algoritmos → yellow, Química → red) |
| 8 | Inserta workout de tipo 'empuje' |
| 9 | Reporte final + limpieza automática si todos los checks pasan |

### 9.4 Checks validados en Paso 6 (plan generation)

- Plan devuelve un array de bloques
- Incluye bloque de TRABAJO (solo en días laborales)
- Incluye bloque de ESTUDIO
- Incluye bloque de VIAJE (garantizado por inyección determinística)
- Incluye bloque de CLASE (en días con clase configurada)
- Estudio prioriza ALGORITMOS (TP en 5 días → urgencia máxima)
- Si hay 2+ bloques de estudio: también incluye QUÍMICA (parcial en 10 días)

### 9.5 Idempotencia

La suite es completamente idempotente. Se puede correr múltiples veces porque:
- El paso 1 detecta y elimina el usuario de test previo antes de crear uno nuevo
- Si todos los checks pasan, el usuario se limpia al final automáticamente

---

## 10. Deploy en Vercel

### 10.1 Prerequisitos

```bash
# Instalar Vercel CLI (si no está instalado)
npm install -g vercel

# Verificar instalación
vercel --version
```

### 10.2 Login y link del proyecto

```bash
# Login (abre browser para autenticación)
vercel login

# Linkear el proyecto a Vercel (crea .vercel/ en el repo)
vercel link --yes --scope <TU-SCOPE> --project iamentor
```

### 10.3 Cargar variables de entorno en Vercel

```bash
# Ejecutar uno por uno (o usar el dashboard de Vercel)
echo "https://TU-ID.supabase.co" | vercel env add NEXT_PUBLIC_SUPABASE_URL production
echo "sb_publishable_XXX"         | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
echo "sb_secret_XXX"              | vercel env add SUPABASE_SERVICE_ROLE_KEY production
echo "sk-ant-api03-XXX"           | vercel env add ANTHROPIC_API_KEY production
echo "XXX.apps.googleusercontent" | vercel env add GOOGLE_CLIENT_ID production
echo "GOCSPX-XXX"                 | vercel env add GOOGLE_CLIENT_SECRET production
echo "https://iamentor.vercel.app"| vercel env add NEXTAUTH_URL production
```

Alternativamente, desde el **Vercel Dashboard** → Settings → Environment Variables.

### 10.4 Deploy a producción

```bash
vercel --prod --yes
```

El build tarda ~2-3 minutos. Al finalizar imprime la URL de producción.

### 10.5 Re-deploy (actualizaciones)

```bash
# Después de cualquier cambio de código
vercel --prod --yes
```

### 10.6 Post-deploy: actualizar URLs en servicios externos

Después del primer deploy, actualizar:

**Supabase** → Authentication → Settings:
```
Site URL: https://iamentor.vercel.app
Redirect URLs: https://iamentor.vercel.app/**
```

**Google Cloud Console** → Credentials → OAuth Client → Authorized redirect URIs:
```
https://iamentor.vercel.app/api/calendar/callback
```

---

## 11. Hard reset de base de datos

Para limpiar todos los datos manteniendo la estructura (útil antes de un lanzamiento oficial):

```bash
node node_modules/ts-node/dist/bin.js --project tests/tsconfig.json scripts/db-reset.ts
```

Esto borra:
- Todos los usuarios de `auth.users` (via Admin API)
- Todas las filas de todas las tablas de aplicación
- Mantiene las tablas, índices, RLS y funciones intactos

> **Atención:** Esta operación es irreversible. Usar solo en desarrollo o antes de un lanzamiento limpio.

---

## 12. Comandos de referencia rápida

```bash
# ── Desarrollo ──────────────────────────────────────────────
node node_modules/next/dist/bin/next dev          # Servidor dev (Windows-safe)
npm run build                                      # Build producción local
npm run lint                                       # Lint (desactivado en build)

# ── Tests ───────────────────────────────────────────────────
node node_modules/ts-node/dist/bin.js \
  --project tests/tsconfig.json \
  tests/e2e-flow.ts                                # Suite E2E completa

# ── DB ──────────────────────────────────────────────────────
node node_modules/ts-node/dist/bin.js \
  --project tests/tsconfig.json \
  scripts/db-reset.ts                              # Hard reset de DB

# ── Vercel ──────────────────────────────────────────────────
vercel whoami                                      # Verificar sesión
vercel env ls                                      # Listar env vars del proyecto
vercel --prod --yes                                # Deploy a producción
vercel logs <URL>                                  # Ver logs del último deploy
vercel inspect <URL> --logs                        # Logs detallados

# ── Supabase (SQL Editor) ────────────────────────────────────
SELECT seed_initial_data('UUID');                  # Cargar datos de ejemplo
SELECT * FROM user_config WHERE user_id = 'UUID'; # Verificar config de usuario
SELECT count(*) FROM topics;                       # Contar temas cargados
```

---

## 13. Troubleshooting

### Error: `SUPABASE_URL is required`
Las variables de entorno no están cargadas. Verificar que `.env.local` existe en la raíz del proyecto y tiene los valores correctos.

---

### Error: `A user with this email address has already been registered` (tests)
El usuario de test anterior no fue limpiado. El script ya maneja esto automáticamente. Si persiste, eliminarlo manualmente en Supabase → Auth → Users.

---

### Error: `vercel: command not found`
Vercel CLI no está instalado globalmente. Solución:
```bash
npm install -g vercel
# O usar npx:
npx vercel --prod
```

---

### Error: `npm run dev` falla en Windows / Git Bash
El `npm.cmd` a veces falla en Git Bash. Usar directamente:
```bash
node node_modules/next/dist/bin/next dev
```

---

### Error: `SyntaxError: missing ) after argument list` al correr tests
El shim de `ts-node` en `.bin/` no funciona correctamente en bash de Windows. Usar:
```bash
node node_modules/ts-node/dist/bin.js --project tests/tsconfig.json tests/e2e-flow.ts
```

---

### Error: `Route /api/calendar/events couldn't be rendered statically`
Este error aparece durante el build de Vercel y **no es un error real** — es solo un warning que indica que la ruta usa cookies (lo cual es correcto). El build y deploy continúan normalmente.

---

### El plan IA no incluye bloques de viaje
Verificar que el check-in del día tiene `travel_route_json` con al menos un elemento. Los bloques de viaje son determinísticos: si el array está vacío, no se generan. Hacer un nuevo check-in con la ruta de viaje completa.

---

### La integración de Google Calendar no funciona
1. Verificar que `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` están en `.env.local`
2. Verificar que la URL de callback está en Google Cloud Console:
   - Dev: `http://localhost:3000/api/calendar/callback`
   - Prod: `https://iamentor.vercel.app/api/calendar/callback`
3. Asegurarse de haber completado el OAuth desde `/settings` → Conectar Google Calendar

---

### El build de Vercel falla con errores de ESLint/TypeScript
El `next.config.js` tiene `ignoreDuringBuilds: true` y `ignoreBuildErrors: true`.
Si reaparecen errores de este tipo después de una actualización, verificar que `next.config.js` aún tiene:
```javascript
eslint: { ignoreDuringBuilds: true },
typescript: { ignoreBuildErrors: true },
```

---

### La app no se instala como PWA en iOS
En iOS la instalación PWA solo funciona desde **Safari** (no Chrome ni Firefox).
1. Abrir la URL en Safari
2. Tocar el botón de compartir (cuadrado con flecha hacia arriba)
3. Seleccionar "Agregar a pantalla de inicio"
4. Confirmar con "Agregar"

---

## Archivos de configuración importantes

| Archivo | Propósito |
|---------|-----------|
| `.env.local` | Variables de entorno secretas (gitignored) |
| `next.config.js` | Config Next.js + PWA + ignoreBuildErrors |
| `tailwind.config.ts` | Design tokens (colores, fuentes) |
| `middleware.ts` | Auth guard — protege todas las rutas `/app/*` |
| `supabase/schema.sql` | Schema completo de la base de datos |
| `supabase/migrations_v3.sql` | Tablas adicionales (profiles, user_config, etc.) |
| `tests/tsconfig.json` | Config TypeScript específica para los tests |
| `public/manifest.json` | PWA manifest (name, icons, display mode) |
| `.vercel/project.json` | Link del proyecto a Vercel (no commitear si es privado) |
