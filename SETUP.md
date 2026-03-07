# Mentor IA Personal — Setup Guide

## Requisitos previos
- Node.js 18+
- Cuenta en [Supabase](https://supabase.com)
- API Key de [Anthropic](https://console.anthropic.com)
- Proyecto en [Google Cloud Console](https://console.cloud.google.com) (para Google Calendar)

---

## 1. Instalación de dependencias

```bash
cd IAmentor
npm install
```

---

## 2. Variables de entorno

Editá el archivo `.env.local` con tus credenciales:

```env
# Supabase (Project Settings > API)
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key

# Anthropic (console.anthropic.com/settings/keys)
ANTHROPIC_API_KEY=sk-ant-...

# Google OAuth (console.cloud.google.com)
GOOGLE_CLIENT_ID=tu_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu_client_secret

# URL de la app (cambiar en producción)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=cualquier_string_random_largo
```

---

## 3. Configurar Supabase

### 3.1 Crear el esquema de base de datos

1. En tu proyecto de Supabase, ve a **SQL Editor**
2. Copiá y ejecutá **todo el contenido** de `supabase/schema.sql`
3. Verificá que todas las tablas se crearon en **Table Editor**

### 3.2 Configurar autenticación de Supabase

1. Ve a **Authentication > Providers**
2. Asegurate que **Email** esté habilitado
3. (Opcional) En **Authentication > URL Configuration**, configurá:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: `http://localhost:3000/today`

### 3.3 Cargar datos iniciales del cuatrimestre

Después de registrarte con tu primer usuario:

1. Ve a **Authentication > Users** en Supabase
2. Copiá el UUID del usuario
3. Ve a **SQL Editor** y ejecutá:

```sql
SELECT seed_initial_data('PEGA-AQUI-TU-UUID');
```

Esto cargará automáticamente:
- Cuatrimestre actual activo
- 4 materias: Química, Anatomía, Física, Algoritmos
- Todas las unidades y temas con estado inicial "rojo"

---

## 4. Configurar Google Calendar API

### 4.1 Crear proyecto en Google Cloud Console

1. Ve a [console.cloud.google.com](https://console.cloud.google.com)
2. Creá un nuevo proyecto o seleccioná uno existente
3. Ve a **APIs & Services > Library**
4. Buscá y habilitá **Google Calendar API**

### 4.2 Crear credenciales OAuth

1. Ve a **APIs & Services > Credentials**
2. Click en **Create Credentials > OAuth client ID**
3. Application type: **Web application**
4. Authorized redirect URIs: agrega `http://localhost:3000/api/calendar/callback`
5. Copiá el **Client ID** y **Client Secret** al `.env.local`

### 4.3 Configurar OAuth Consent Screen

1. Ve a **OAuth consent screen**
2. User type: **External**
3. Completa nombre de app, email de soporte
4. En Scopes, agregá:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/userinfo.email`
5. En Test users, agregá tu email

> **Nota**: La integración con Google Calendar es opcional. La app funciona completamente sin ella.

---

## 5. Generar iconos PWA

Necesitás crear dos iconos para la PWA. Podés usar cualquier herramienta:
- [RealFaviconGenerator](https://realfavicongenerator.net/)
- [PWA Image Generator](https://www.pwabuilder.com/imageGenerator)

Colocá los archivos en `/public/icons/`:
- `icon-192x192.png`
- `icon-512x512.png`
- `apple-touch-icon.png`

---

## 6. Ejecutar en desarrollo

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000)

---

## 7. Build para producción

```bash
npm run build
npm start
```

---

## 8. Deploy recomendado: Vercel

```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel

# Configurar variables de entorno en vercel.com/dashboard
```

**Variables de entorno en Vercel**: Ve a tu proyecto > Settings > Environment Variables y agrega todas las del `.env.local`.

**Redirect URI para Google**: en producción, cambiá `http://localhost:3000` por tu dominio en:
- Google Cloud Console > Authorized redirect URIs
- Variable `NEXTAUTH_URL`

---

## Estructura del proyecto

```
IAmentor/
├── app/
│   ├── (auth)/login/       # Página de login
│   ├── (app)/
│   │   ├── layout.tsx      # Layout con BottomNav
│   │   ├── today/          # Pantalla principal (Hoy)
│   │   ├── checkin/        # Check-in matutino
│   │   ├── subjects/       # Tracker académico
│   │   │   └── [id]/       # Detalle de materia
│   │   ├── gym/            # Entrenamiento físico
│   │   ├── stats/          # Estadísticas
│   │   └── settings/       # Configuración
│   └── api/
│       ├── ai/plan/        # Genera plan con Claude
│       ├── ai/replan/      # Replanifica el día
│       ├── ai/weekly-insight/ # Insight semanal IA
│       ├── calendar/auth/  # OAuth Google
│       ├── calendar/callback/ # Callback OAuth
│       ├── calendar/events/ # Eventos del día
│       └── plan/update-block/ # Actualiza bloque completado
├── components/
│   ├── ui/                 # Componentes UI reutilizables
│   ├── layout/             # BottomNav
│   └── features/           # ReplanButton (FAB)
├── lib/
│   ├── supabase.ts         # Cliente Supabase (browser)
│   ├── supabase-server.ts  # Cliente Supabase (server)
│   ├── anthropic.ts        # Integración Claude API
│   ├── google-calendar.ts  # Google Calendar API
│   ├── study-priority.ts   # Lógica pura de priorización ← testeable
│   ├── exercises.ts        # Base de ejercicios + Wger API
│   └── utils.ts            # Utilidades generales
├── types/index.ts          # Tipos TypeScript
├── supabase/schema.sql     # Esquema DB + seed function
├── middleware.ts           # Auth middleware
└── SETUP.md               # Este archivo
```

---

## Flujo de uso diario

1. **Mañana**: Completar check-in → La IA genera el plan del día
2. **Durante el día**: Marcar bloques como completados + botón ⚡ si algo cambia
3. **En viajes**: Ver los bloques de viaje con temas teóricos sugeridos
4. **En facultad**: Registrar post-clase con comprensión de temas
5. **Gym**: Ver la sesión recomendada según energía y marcar como completada
6. **Noche**: Revisar estadísticas del día

---

## Gestión de cuatrimestres

Para crear un nuevo cuatrimestre al inicio de uno nuevo:
1. Ve a **Configuración > Cuatrimestres > + Nuevo**
2. Completá nombre, fecha de inicio y fin
3. Activarlo como cuatrimestre activo
4. Los cuatrimestres anteriores quedan archivados y se pueden ver en estadísticas

Las materias de cada cuatrimestre se pueden cargar manualmente desde la UI (próxima versión) o directamente en Supabase Table Editor.

---

## Troubleshooting

**El plan no se genera**: Verificá que hiciste el check-in del día.

**Google Calendar no conecta**: Revisá que el Client ID y Secret sean correctos y que el redirect URI coincida exactamente.

**La seed no carga**: Asegurate de copiar el UUID correcto del usuario desde Authentication > Users en Supabase.

**Error de build con next-pwa**: En desarrollo el PWA está deshabilitado automáticamente. Solo aplica en producción (`NODE_ENV=production`).
