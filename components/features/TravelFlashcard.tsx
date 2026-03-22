'use client'

import { useState } from 'react'
import type { MicroReview } from '@/types'

interface Props {
  microReview: MicroReview
  blockTitle: string
  onClose: () => void
}

/**
 * TravelFlashcard — swipeable pill cards for travel block micro_review content.
 * Shows each concept pill as a fullscreen card, followed by a self-eval "1-5" step.
 */
export default function TravelFlashcard({ microReview, blockTitle, onClose }: Props) {
  // Total steps = pills + self_test question + summary
  const pills = microReview.pills ?? []
  const totalCards = pills.length + 1  // last card = self-eval
  const [currentIndex, setCurrentIndex] = useState(0)
  const [rating, setRating] = useState<number | null>(null)
  const [saved, setSaved] = useState(false)

  // Touch/swipe handling
  const [touchStartX, setTouchStartX] = useState<number | null>(null)

  function handleTouchStart(e: React.TouchEvent) {
    setTouchStartX(e.touches[0].clientX)
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX === null) return
    const deltaX = e.changedTouches[0].clientX - touchStartX
    if (Math.abs(deltaX) > 48) {
      if (deltaX < 0 && currentIndex < totalCards - 1) setCurrentIndex(i => i + 1)
      if (deltaX > 0 && currentIndex > 0) setCurrentIndex(i => i - 1)
    }
    setTouchStartX(null)
  }

  function handleSaveRating(r: number) {
    setRating(r)
    setSaved(true)
    // Persist to localStorage — lightweight, no DB needed
    const key = `travel_rating_${blockTitle}_${new Date().toISOString().split('T')[0]}`
    localStorage.setItem(key, String(r))
  }

  const isSelfEvalCard = currentIndex === pills.length
  const isLastStep = isSelfEvalCard && saved

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0A0F1E]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3 shrink-0">
        <div className="flex flex-col min-w-0">
          <p className="text-[10px] text-text-secondary uppercase tracking-wide">Repaso de viaje</p>
          <p className="text-sm font-semibold text-text-primary truncate">{microReview.topic}</p>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary hover:text-text-primary transition-colors shrink-0"
          aria-label="Cerrar"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1.5 pb-4 shrink-0">
        {Array.from({ length: totalCards }).map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all duration-200 ${
              i === currentIndex
                ? 'w-4 h-1.5 bg-primary'
                : i < currentIndex
                  ? 'w-1.5 h-1.5 bg-primary/40'
                  : 'w-1.5 h-1.5 bg-surface-2'
            }`}
          />
        ))}
      </div>

      {/* Card area */}
      <div
        className="flex-1 flex items-center justify-center px-6"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {!isSelfEvalCard ? (
          /* Concept pill card */
          <div className="w-full max-w-sm rounded-3xl bg-surface border border-border-subtle p-8 text-center">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 flex items-center justify-center mx-auto mb-5">
              <span className="text-lg font-bold text-amber-400">{currentIndex + 1}</span>
            </div>
            <p className="text-base font-semibold text-text-primary leading-relaxed">
              {pills[currentIndex]}
            </p>
            <p className="text-xs text-text-secondary mt-4">
              Deslizá → para continuar
            </p>
          </div>
        ) : isLastStep ? (
          /* Saved summary */
          <div className="w-full max-w-sm rounded-3xl bg-green-500/10 border border-green-500/30 p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-green-300 mb-1">
              {rating! >= 4 ? '¡Excelente retención!' : rating! >= 3 ? 'Buen repaso' : 'Seguí repasando'}
            </p>
            <p className="text-xs text-text-secondary">
              Registraste {pills.length} conceptos de <strong className="text-text-primary">{microReview.topic}</strong>
            </p>
            <button
              onClick={onClose}
              className="mt-5 w-full py-2.5 rounded-2xl bg-green-500/20 border border-green-500/30 text-sm font-semibold text-green-300 hover:bg-green-500/30 transition-colors"
            >
              Cerrar
            </button>
          </div>
        ) : (
          /* Self-eval card */
          <div className="w-full max-w-sm rounded-3xl bg-surface border border-border-subtle p-8 text-center">
            <div className="w-10 h-10 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-5">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-text-primary mb-2">
              {microReview.self_test}
            </p>
            <p className="text-xs text-text-secondary mb-5">¿Cuánto retuviste?</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => handleSaveRating(n)}
                  className="w-11 h-11 rounded-2xl bg-surface-2 border border-border-subtle text-sm font-bold text-text-secondary hover:bg-primary/20 hover:border-primary/40 hover:text-primary transition-all"
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-text-secondary mt-2">1 = poco · 5 = mucho</p>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      {!isLastStep && (
        <div className="flex items-center justify-between px-6 pb-8 pt-4 shrink-0 gap-3">
          <button
            onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="flex-1 py-2.5 rounded-2xl bg-surface-2 border border-border-subtle text-sm font-medium text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors"
          >
            ← Anterior
          </button>
          {currentIndex < totalCards - 1 ? (
            <button
              onClick={() => setCurrentIndex(i => i + 1)}
              className="flex-1 py-2.5 rounded-2xl bg-primary/15 border border-primary/30 text-sm font-semibold text-primary hover:bg-primary/25 transition-colors"
            >
              Siguiente →
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-2xl bg-surface-2 border border-border-subtle text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Cerrar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
