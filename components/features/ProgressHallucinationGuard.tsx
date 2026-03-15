'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import type { HallucinationChallenge, TopicStatus } from '@/types'

interface Props {
  challenge: HallucinationChallenge
  onResult: (passed: boolean, newStatus: TopicStatus) => void
  onClose: () => void
}

/**
 * ProgressHallucinationGuard
 *
 * Modal shown when a user marks more than 3 topics as "mastered" within
 * 2 hours. Presents a micro-validation challenge to verify real comprehension.
 *
 * On pass  → topic stays green, parent is notified
 * On fail  → topic reverts to yellow (review_needed), parent is notified
 * On skip  → topic stays green (benefit of the doubt)
 */
export default function ProgressHallucinationGuard({ challenge, onResult, onClose }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ passed: boolean; newStatus: TopicStatus } | null>(null)

  async function handleSubmit() {
    if (selectedIndex === null) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/topics/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completion_id: challenge.completion_id,
          topic_id: challenge.topic_id,
          selected_index: selectedIndex,
        }),
      })
      const data = await res.json()
      setResult({ passed: data.passed, newStatus: data.new_status })
    } catch (err) {
      console.error('[HallucinationGuard] validate error', err)
      // On network error: benefit of the doubt, keep green
      setResult({ passed: true, newStatus: 'green' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSkip() {
    setSubmitting(true)
    try {
      await fetch('/api/topics/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completion_id: challenge.completion_id,
          topic_id: challenge.topic_id,
          selected_index: 0,
          skipped: true,
        }),
      })
    } catch { /* ignore */ } finally {
      setSubmitting(false)
      onClose()
    }
  }

  function handleDismissResult() {
    if (result) onResult(result.passed, result.newStatus)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pt-4 pb-24 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl p-5 shadow-2xl">

        {/* ── Result screen ─────────────────────────────────── */}
        {result ? (
          <div className="text-center py-4">
            <p className="text-5xl mb-3">{result.passed ? '🎉' : '📚'}</p>
            {result.passed ? (
              <>
                <p className="text-lg font-bold text-green-400 mb-1">¡Correcto!</p>
                <p className="text-sm text-text-secondary">
                  Dominio confirmado. El tema sigue marcado como aprendido.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-amber-400 mb-1">Necesita repaso</p>
                <p className="text-sm text-text-secondary">
                  El tema volvió a <span className="text-amber-400 font-medium">en progreso</span>.
                  Un pequeño repaso y lo dominarás.
                </p>
              </>
            )}
            <Button
              variant={result.passed ? 'success' : 'primary'}
              size="lg"
              className="w-full mt-5"
              onClick={handleDismissResult}
            >
              {result.passed ? 'Continuar' : 'Entendido, voy a repasar'}
            </Button>
          </div>
        ) : (
          <>
            {/* ── Challenge screen ──────────────────────────── */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">⚡</span>
                  <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                    Verificación rápida
                  </p>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  ¡Vas volando! Según la ciencia del aprendizaje, repasar ahora
                  ayuda a fijar el conocimiento.
                </p>
              </div>
              <button
                onClick={handleSkip}
                disabled={submitting}
                className="ml-3 w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary text-sm shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Topic badge */}
            <div className="mb-4 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-xs font-medium text-primary">{challenge.topic_name}</span>
            </div>

            {/* Question */}
            <p className="text-sm font-semibold text-text-primary mb-4 leading-snug">
              {challenge.question}
            </p>

            {/* Options */}
            <div className="space-y-2.5 mb-5">
              {challenge.options.map((option, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedIndex(i)}
                  className={`w-full text-left px-4 py-3 rounded-2xl border text-sm transition-all ${
                    selectedIndex === i
                      ? 'border-primary bg-primary/15 text-text-primary font-medium'
                      : 'border-border-subtle bg-surface-2 text-text-secondary hover:border-border-default'
                  }`}
                >
                  <span className="font-bold mr-2 text-xs">{String.fromCharCode(65 + i)}.</span>
                  {option}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleSkip}
                disabled={submitting}
                className="flex-1 py-3 rounded-2xl border border-border-subtle text-sm text-text-secondary"
              >
                Omitir
              </button>
              <Button
                variant="primary"
                size="lg"
                className="flex-1"
                onClick={handleSubmit}
                loading={submitting}
                disabled={selectedIndex === null}
              >
                Confirmar
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
