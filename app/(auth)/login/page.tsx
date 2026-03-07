'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Button from '@/components/ui/Button'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setSuccess('Revisá tu email para confirmar la cuenta. Luego podés iniciar sesión.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        window.location.href = '/today'
      }
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error')
    } finally {
      setLoading(false)
    }
  }

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

      {/* Form */}
      <div className="w-full max-w-sm">
        <div className="bg-surface border border-border-subtle rounded-3xl p-6 shadow-2xl">
          <h2 className="text-lg font-semibold text-text-primary mb-5">
            {isSignUp ? 'Crear cuenta' : 'Iniciar sesión'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                className="w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle
                           text-text-primary placeholder-text-secondary text-sm
                           focus:outline-none focus:border-primary/60 transition-colors"
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
                className="w-full h-11 px-4 rounded-2xl bg-surface-2 border border-border-subtle
                           text-text-primary placeholder-text-secondary text-sm
                           focus:outline-none focus:border-primary/60 transition-colors"
                placeholder="••••••••"
              />
            </div>

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

            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {isSignUp ? 'Crear cuenta' : 'Entrar'}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(null); setSuccess(null) }}
              className="text-sm text-text-secondary hover:text-primary transition-colors"
            >
              {isSignUp
                ? '¿Ya tenés cuenta? Iniciá sesión'
                : '¿No tenés cuenta? Registrate'}
            </button>
          </div>
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
