'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Button from '@/components/ui/Button'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const supabase = createClient()

  function validate(): string | null {
    if (!email || !password) return 'Completá todos los campos obligatorios.'
    if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.'
    if (isSignUp) {
      if (!fullName.trim()) return 'Ingresá tu nombre completo.'
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
        // Session returned immediately when email confirmation is disabled
        if (data.session) {
          window.location.href = '/today'
        } else {
          setSuccess('Cuenta creada. Revisá tu email para confirmar y luego iniciá sesión.')
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
        setError('Confirmá tu email antes de iniciar sesión.')
      } else if (msg.includes('User already registered')) {
        setError('Este email ya está registrado. Iniciá sesión.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  function switchMode() {
    setIsSignUp(!isSignUp)
    setError(null)
    setSuccess(null)
    setConfirmPassword('')
    setFullName('')
  }

  const inputClass = `w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle
    text-text-primary placeholder-text-secondary text-sm
    focus:outline-none focus:border-primary/60 transition-colors`

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center px-5">
      {/* Logo / Header */}
      <div className="text-center mb-10">
        <div className="w-16 h-16 rounded-3xl bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
          <span className="text-3xl">🧠</span>
        </div>
        <h1 className="text-2xl font-bold text-text-primary">Mentor IA Personal</h1>
        <p className="text-text-secondary text-sm mt-1">Tu compañero de productividad inteligente</p>
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
                onClick={() => { if (isSignUp !== tab.value) switchMode() }}
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
                minLength={6}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                className={inputClass}
                placeholder="••••••••"
              />
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
                  minLength={6}
                  autoComplete="new-password"
                  className={inputClass}
                  placeholder="••••••••"
                />
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
              </div>
            )}

            <Button type="submit" size="lg" className="w-full !mt-4" loading={loading}>
              {isSignUp ? 'Crear cuenta' : 'Entrar'}
            </Button>
          </form>
        </div>

        {/* Features preview */}
        <div className="mt-8 grid grid-cols-2 gap-3">
          {[
            { emoji: '🎯', text: 'Plan diario con IA' },
            { emoji: '📚', text: 'Tracker académico' },
            { emoji: '💪', text: 'Rutina física' },
            { emoji: '📊', text: 'Estadísticas' },
          ].map(f => (
            <div key={f.text} className="flex items-center gap-2 p-3 rounded-2xl bg-surface border border-border-subtle">
              <span className="text-lg">{f.emoji}</span>
              <span className="text-xs text-text-secondary">{f.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
