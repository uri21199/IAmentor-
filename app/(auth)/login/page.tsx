'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Button from '@/components/ui/Button'

const FEATURES = [
  {
    icon: '☀️',
    title: 'Check-in matutino',
    desc: 'Contá cómo llegás al día: sueño, energía y planes.',
  },
  {
    icon: '🤖',
    title: 'Plan diario con IA',
    desc: 'Claude genera tu cronograma personalizado en segundos.',
  },
  {
    icon: '📚',
    title: 'Tracker académico',
    desc: 'Seguí el progreso de tus materias tema a tema.',
  },
  {
    icon: '📊',
    title: 'Estadísticas',
    desc: 'Visualizá tu racha de estudio y evolución semanal.',
  },
]

function getPasswordRequirements(pwd: string) {
  return [
    { label: 'Al menos 8 caracteres', met: pwd.length >= 8 },
    { label: 'Una mayúscula (A-Z)', met: /[A-Z]/.test(pwd) },
    { label: 'Un número (0-9)', met: /[0-9]/.test(pwd) },
    { label: 'Un símbolo (!@#$...)', met: /[^A-Za-z0-9]/.test(pwd) },
  ]
}

export default function LoginPage() {
  const [view, setView] = useState<'landing' | 'auth'>('landing')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const supabase = createClient()
  const pwdReqs = getPasswordRequirements(password)
  const allPwdReqsMet = pwdReqs.every(r => r.met)

  function validate(): string | null {
    if (!email || !password) return 'Completá todos los campos obligatorios.'
    if (isSignUp) {
      if (!fullName.trim()) return 'Ingresá tu nombre completo.'
      if (!allPwdReqsMet) return 'La contraseña no cumple los requisitos de seguridad.'
      if (password !== confirmPassword) return 'Las contraseñas no coinciden.'
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName.trim() } },
        })
        if (error) throw error
        if (data.session) {
          window.location.href = '/today'
        } else {
          setSuccess('¡Cuenta creada! Revisá tu bandeja de entrada para confirmar tu email. Si no lo ves, chequeá la carpeta de spam.')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        window.location.href = '/today'
      }
    } catch (err: any) {
      const msg = err.message || 'Ocurrió un error'
      if (msg.includes('Invalid login credentials')) {
        setError('Email o contraseña incorrectos.')
      } else if (msg.includes('Email not confirmed')) {
        setError('Confirmá tu email antes de iniciar sesión. Revisá también la carpeta de spam.')
      } else if (msg.includes('User already registered')) {
        setError('Este email ya está registrado. Iniciá sesión.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  function switchMode(toSignUp: boolean) {
    setIsSignUp(toSignUp)
    setError(null)
    setSuccess(null)
    setPassword('')
    setConfirmPassword('')
    setFullName('')
  }

  function goToAuth(signUp: boolean) {
    setIsSignUp(signUp)
    setView('auth')
  }

  const inputClass = `w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle
    text-text-primary placeholder-text-secondary text-sm
    focus:outline-none focus:border-primary/60 transition-colors`

  // ── LANDING VIEW ──────────────────────────────────────────
  if (view === 'landing') {
    return (
      <div className="min-h-dvh bg-background flex flex-col px-5 pt-12 pb-8">
        {/* Logo + Header */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 rounded-3xl bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-primary/20">
            <span className="text-4xl">🧠</span>
          </div>
          <h1 className="text-3xl font-bold text-text-primary">Mentor IA Personal</h1>
          <p className="text-text-secondary text-base mt-2 max-w-xs mx-auto leading-relaxed">
            Tu compañero inteligente para estudiar y trabajar mejor cada día
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {FEATURES.map(f => (
            <div
              key={f.title}
              className="p-4 rounded-2xl bg-surface border border-border-subtle"
            >
              <span className="text-2xl block mb-2">{f.icon}</span>
              <p className="text-sm font-semibold text-text-primary leading-tight">{f.title}</p>
              <p className="text-xs text-text-secondary mt-1 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="mb-10">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3 text-center">
            Cómo funciona
          </p>
          <div className="space-y-2.5">
            {[
              { step: '1', text: '☀️  Hacés el check-in matutino (2 min)' },
              { step: '2', text: '✨  La IA genera tu plan del día' },
              { step: '3', text: '✅  Ejecutás el plan y medís tu progreso' },
            ].map(item => (
              <div key={item.step} className="flex items-center gap-3 p-3 rounded-2xl bg-surface-2 border border-border-subtle">
                <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">{item.step}</span>
                </div>
                <span className="text-sm text-text-primary">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div className="space-y-3 mt-auto">
          <Button variant="primary" size="lg" className="w-full" onClick={() => goToAuth(true)}>
            Crear cuenta gratis
          </Button>
          <Button variant="secondary" size="lg" className="w-full" onClick={() => goToAuth(false)}>
            Ya tengo cuenta — Iniciar sesión
          </Button>
        </div>
      </div>
    )
  }

  // ── AUTH VIEW ──────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-background flex flex-col px-5 py-8">
      {/* Back to landing */}
      <button
        onClick={() => { setView('landing'); setError(null); setSuccess(null) }}
        className="text-text-secondary text-sm flex items-center gap-1 mb-4 hover:text-text-primary transition-colors w-fit"
      >
        ← Volver
      </button>

      {/* Content centered */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center mb-7">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">🧠</span>
          </div>
          <h1 className="text-xl font-bold text-text-primary">Mentor IA Personal</h1>
        </div>

        <div className="w-full max-w-sm">
          <div className="bg-surface border border-border-subtle rounded-3xl p-6 shadow-2xl">

            {/* Tab switcher */}
            <div className="flex gap-1 p-1 bg-surface-2 rounded-2xl mb-5">
              {[
                { value: false, label: 'Iniciar sesión' },
                { value: true, label: 'Registrarse' },
              ].map(tab => (
                <button
                  key={String(tab.value)}
                  onClick={() => switchMode(tab.value)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    isSignUp === tab.value
                      ? 'bg-surface text-text-primary shadow-sm'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {isSignUp && (
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5" htmlFor="fullName">
                    Nombre completo
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    required={isSignUp}
                    autoComplete="name"
                    className={inputClass}
                    placeholder="Tu nombre"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm text-text-secondary mb-1.5" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={inputClass}
                  placeholder="tu@email.com"
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1.5" htmlFor="password">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  className={inputClass}
                  placeholder="••••••••"
                />
                {isSignUp && password.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {pwdReqs.map(req => (
                      <div key={req.label} className="flex items-center gap-1.5">
                        <span className={`text-xs font-semibold ${req.met ? 'text-green-400' : 'text-text-secondary'}`}>
                          {req.met ? '✓' : '·'}
                        </span>
                        <span className={`text-xs ${req.met ? 'text-green-400' : 'text-text-secondary'}`}>
                          {req.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {isSignUp && password.length === 0 && (
                  <p className="text-xs text-text-secondary mt-1.5">
                    Mínimo 8 caracteres, una mayúscula, un número y un símbolo
                  </p>
                )}
              </div>

              {isSignUp && (
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5" htmlFor="confirmPassword">
                    Confirmar contraseña
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required={isSignUp}
                    autoComplete="new-password"
                    className={inputClass}
                    placeholder="••••••••"
                  />
                  {confirmPassword.length > 0 && password !== confirmPassword && (
                    <p className="text-xs text-red-400 mt-1.5">Las contraseñas no coinciden</p>
                  )}
                </div>
              )}

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {success && (
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                  <p className="text-sm text-green-400">{success}</p>
                  <p className="text-xs text-green-400/70 mt-1.5">
                    ¿No lo recibiste? Chequeá la carpeta de spam o esperá unos minutos.
                  </p>
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                className="w-full !mt-4"
                loading={loading}
                disabled={isSignUp && password.length > 0 && !allPwdReqsMet}
              >
                {isSignUp ? 'Crear cuenta' : 'Entrar'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
