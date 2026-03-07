'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'

export default function ReplanButton() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleReplan() {
    if (!text.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/ai/replan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ change: text }),
      })
      if (!res.ok) throw new Error('Error al replanificar')
      setSuccess(true)
      setTimeout(() => {
        setOpen(false)
        setSuccess(false)
        setText('')
        // Refresh the page to show updated plan
        window.location.reload()
      }, 1500)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-amber-500 text-white shadow-xl shadow-amber-500/30 flex items-center justify-center text-xl active:scale-95 transition-transform"
        aria-label="Replanificar"
      >
        ⚡
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-text-primary">⚡ ¡Cambió algo!</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Contame qué pasó y la IA reorganiza tu día
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                ✕
              </button>
            </div>

            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Ej: Tuve una reunión imprevista que duró 2 horas. Llegué tarde a casa..."
              className="w-full h-28 px-4 py-3 rounded-2xl bg-surface-2 border border-border-subtle
                         text-text-primary placeholder-text-secondary text-sm resize-none
                         focus:outline-none focus:border-primary/60 transition-colors"
            />

            {success && (
              <div className="mt-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                <p className="text-sm text-green-400">✅ Plan actualizado correctamente</p>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <Button variant="secondary" size="md" className="flex-1" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="md"
                className="flex-1"
                onClick={handleReplan}
                loading={loading}
                disabled={!text.trim()}
              >
                Replanificar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
