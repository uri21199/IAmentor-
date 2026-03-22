'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { TopicComprehension } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────
const STUDY_SEC = 25 * 60
const BREAK_SEC = 5 * 60
const CIRCLE_R  = 88
const CIRC      = 2 * Math.PI * CIRCLE_R

const BREAK_MSGS = [
  'Buen trabajo, descansá 5 minutos',
  '¡Excelente sesión! Tu cerebro necesita este descanso',
  'Bien hecho, tomá agua y estirá un poco',
  'Sos una máquina. 5 minutos y seguimos',
  'Sesión completada. Respirá y relajá la vista',
]

// ── Types ─────────────────────────────────────────────────────────────────────
type Phase = 'study' | 'break' | 'rating'

interface Props {
  blockId?:     string | null
  subjectId?:   string
  topicId?:     string
  subjectName?: string
  subjectColor?: string  // hex e.g. '#8B5CF6'
  topicName?:   string
  userId:       string
  planDate:     string
  onComplete:   (status: TopicComprehension) => void
  onAbandon:    () => void
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PomodoroFocus({
  blockId, subjectId, topicId,
  subjectName, subjectColor = '#8B5CF6',
  topicName, userId, planDate,
  onComplete, onAbandon,
}: Props) {
  const supabase = createClient()

  // ── UI state ────────────────────────────────────────────────────────────────
  const [phase,       setPhase]       = useState<Phase>('study')
  const [remaining,   setRemaining]   = useState(STUDY_SEC)
  const [paused,      setPaused]      = useState(false)
  const [showAbandon, setShowAbandon] = useState(false)
  const [rating,      setRating]      = useState<TopicComprehension | null>(null)
  const [saving,      setSaving]      = useState(false)

  // ── Timer refs (avoid stale-closure issues in setInterval) ──────────────────
  const startedAt   = useRef(Date.now())   // ms timestamp when current run began
  const accumulated = useRef(0)            // seconds elapsed before current run
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const phaseRef    = useRef<Phase>('study')
  const pausedRef   = useRef(false)
  const endedRef    = useRef(false)

  // Keep refs in sync with state (safe to read from inside setInterval)
  phaseRef.current  = phase
  pausedRef.current = paused

  // ── Other refs ──────────────────────────────────────────────────────────────
  const sessionStartRef = useRef(new Date().toISOString())
  const breakMsgRef     = useRef(BREAK_MSGS[Math.floor(Math.random() * BREAK_MSGS.length)])
  const wakeLockRef     = useRef<any>(null)
  const audioCtxRef     = useRef<AudioContext | null>(null)

  // ── Audio ────────────────────────────────────────────────────────────────────
  function playChime() {
    try {
      const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext
      const ctx = audioCtxRef.current ?? new AudioCtx()
      audioCtxRef.current = ctx

      const note = (freq: number, t: number, dur: number) => {
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type           = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.25, t + 0.05)
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
        osc.start(t)
        osc.stop(t + dur)
      }

      const t = ctx.currentTime
      note(523, t,       0.5)  // C5
      note(659, t + 0.2, 0.5)  // E5
      note(784, t + 0.4, 0.8)  // G5
    } catch { /* AudioContext unavailable — fail silently */ }
  }

  // ── Notify + vibrate ─────────────────────────────────────────────────────────
  function triggerEffects(msg: string) {
    navigator.vibrate?.([200, 100, 200])
    playChime()
    // Show Web Notification only when app is backgrounded
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification('🍅 Mentor IA', { body: msg, icon: '/icons/icon-192.png' })
    }
  }

  // ── Timer calculation (timestamp-based → survives background tab) ───────────
  function calcRemaining(): number {
    const total = phaseRef.current === 'study' ? STUDY_SEC : BREAK_SEC
    if (pausedRef.current) return total - accumulated.current
    const elapsed = accumulated.current + (Date.now() - startedAt.current) / 1000
    return Math.max(0, total - elapsed)
  }

  // tickRef: always holds the latest version so setInterval never has stale closure
  const tickRef = useRef<() => void>(() => {})
  tickRef.current = () => {
    const r = calcRemaining()
    setRemaining(Math.ceil(r))

    if (r <= 0 && !endedRef.current) {
      endedRef.current = true
      clearInterval(intervalRef.current!)

      if (phaseRef.current === 'study') {
        triggerEffects('¡Tiempo de estudio completado! Tomá un descanso')
        setPhase('break')
      } else if (phaseRef.current === 'break') {
        triggerEffects('¡Descanso terminado! Contanos cómo te fue')
        setPhase('rating')
      }
    }
  }

  // ── Start / restart interval when phase changes ──────────────────────────────
  useEffect(() => {
    if (phase === 'rating') return  // no timer in rating phase

    startedAt.current   = Date.now()
    accumulated.current = 0
    endedRef.current    = false
    setPaused(false)
    setRemaining(phase === 'study' ? STUDY_SEC : BREAK_SEC)

    clearInterval(intervalRef.current!)
    intervalRef.current = setInterval(() => tickRef.current(), 250)

    return () => clearInterval(intervalRef.current!)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // ── Visibility change: recalculate when user returns to app ──────────────────
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) tickRef.current()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // ── Wake Lock: keep screen on during focus ───────────────────────────────────
  useEffect(() => {
    async function acquireWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen')
        }
      } catch { /* not supported or denied — continue without it */ }
    }
    acquireWakeLock()

    // Re-acquire after the tab becomes visible again (lock releases when hidden)
    const onVisibility = async () => {
      if (!document.hidden && !wakeLockRef.current) await acquireWakeLock()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      wakeLockRef.current?.release()
      wakeLockRef.current = null
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // ── Notification permission (first-run) ──────────────────────────────────────
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // ── Pause / Resume ────────────────────────────────────────────────────────────
  function handlePause() {
    if (pausedRef.current || phase === 'rating') return
    accumulated.current += (Date.now() - startedAt.current) / 1000
    clearInterval(intervalRef.current!)
    setPaused(true)
  }

  function handleResume() {
    if (!pausedRef.current || phase === 'rating') return
    startedAt.current = Date.now()
    clearInterval(intervalRef.current!)
    intervalRef.current = setInterval(() => tickRef.current(), 250)
    setPaused(false)
  }

  // ── Rating: save session + update topic ──────────────────────────────────────
  async function handleRate(r: TopicComprehension) {
    if (saving) return
    setRating(r)
    setSaving(true)
    try {
      await supabase.from('pomodoro_sessions').insert({
        user_id:            userId,
        block_id:           blockId,
        subject_id:         subjectId  ?? null,
        topic_id:           topicId    ?? null,
        started_at:         sessionStartRef.current,
        completed_at:       new Date().toISOString(),
        duration_minutes:   STUDY_SEC / 60,
        was_completed:      true,
        topic_status_after: r,
      })
      if (topicId) {
        await supabase.from('topics')
          .update({ status: r, last_studied: new Date().toISOString() })
          .eq('id', topicId)
      }
    } catch (e) {
      console.error('Error saving pomodoro session:', e)
    } finally {
      setSaving(false)
      onComplete(r)
    }
  }

  // ── Abandon ───────────────────────────────────────────────────────────────────
  async function handleConfirmAbandon() {
    const studiedMin = phaseRef.current === 'study'
      ? Math.max(1, Math.floor((STUDY_SEC - remaining) / 60))
      : STUDY_SEC / 60  // abandoned during break = study was completed

    try {
      await supabase.from('pomodoro_sessions').insert({
        user_id:            userId,
        block_id:           blockId,
        subject_id:         subjectId ?? null,
        topic_id:           topicId   ?? null,
        started_at:         sessionStartRef.current,
        completed_at:       new Date().toISOString(),
        duration_minutes:   studiedMin,
        was_completed:      false,
        topic_status_after: null,
      })
    } catch (e) {
      console.error(e)
    }

    onAbandon()
  }

  // ── Derived display values ────────────────────────────────────────────────────
  const totalSec    = phase === 'study' ? STUDY_SEC : BREAK_SEC
  const progress    = totalSec > 0 ? remaining / totalSec : 0
  // dashoffset increases as time passes → circle "drains" (not fills)
  const dashOffset  = CIRC * (1 - progress)

  const accent      = subjectColor?.startsWith('#') ? subjectColor : '#8B5CF6'
  const circleColor = phase === 'break' ? '#60A5FA' : accent   // softer blue for break

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col select-none"
      style={{ backgroundColor: '#0A0F1E' }}
    >
      {/* ── Top bar: subject / topic / close ──────────────────────────────── */}
      <div className="flex items-start justify-between px-5 pt-12 pb-3 shrink-0">
        <div className="flex-1 min-w-0 pr-3">
          {subjectName && (
            <p
              className="text-[11px] font-semibold tracking-[0.15em] uppercase truncate"
              style={{ color: `${circleColor}CC` }}
            >
              {subjectName}
            </p>
          )}
          {topicName && (
            <p className="text-base font-bold text-white mt-1 truncate">{topicName}</p>
          )}
        </div>

        {phase !== 'rating' && (
          <button
            onClick={() => setShowAbandon(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-opacity active:opacity-60"
            style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
            aria-label="Salir del modo foco"
          >
            <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Phase label ───────────────────────────────────────────────────── */}
      <p
        className="text-center text-[11px] font-semibold tracking-[0.2em] uppercase shrink-0"
        style={{ color: `${circleColor}70` }}
      >
        {phase === 'study' ? 'Tiempo de foco' : phase === 'break' ? 'Descanso' : '¿Cómo quedaste?'}
      </p>

      {/* ── Timer + controls (hidden during rating) ───────────────────────── */}
      {phase !== 'rating' && (
        <div className="flex-1 flex flex-col items-center justify-center">

          {/* SVG circular timer */}
          <div className="relative">
            <svg width="240" height="240" viewBox="0 0 240 240" aria-hidden>
              {/* Track */}
              <circle
                cx="120" cy="120" r={CIRCLE_R}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="10"
              />
              {/* Progress arc — drains as time passes */}
              <circle
                cx="120" cy="120" r={CIRCLE_R}
                fill="none"
                stroke={circleColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 120 120)"
                style={{ transition: 'stroke-dashoffset 0.25s linear' }}
              />
            </svg>

            {/* Time digits */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span
                className="text-white font-bold leading-none tabular-nums"
                style={{ fontSize: 72, letterSpacing: -2 }}
              >
                {mm}:{ss}
              </span>
              {paused && (
                <span
                  className="text-xs tracking-widest uppercase mt-3"
                  style={{ color: 'rgba(255,255,255,0.35)' }}
                >
                  Pausado
                </span>
              )}
            </div>
          </div>

          {/* Break motivational message */}
          {phase === 'break' && (
            <p className="text-sm text-white/50 text-center px-10 mt-6 leading-relaxed">
              {breakMsgRef.current}
            </p>
          )}

          {/* Pause / Resume button */}
          <div className="mt-10">
            <button
              onClick={paused ? handleResume : handlePause}
              className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95"
              style={{
                backgroundColor: `${circleColor}1A`,
                border: `2px solid ${circleColor}50`,
              }}
              aria-label={paused ? 'Reanudar' : 'Pausar'}
            >
              {paused ? (
                <svg className="w-7 h-7 ml-1" fill={circleColor} viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill={circleColor} viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Rating bottom sheet ───────────────────────────────────────────── */}
      {phase === 'rating' && (
        <div className="flex-1 flex flex-col justify-end">
          <div className="px-5 pb-10 pt-4">
            {/* Handle */}
            <div className="w-10 h-1 rounded-full bg-white/15 mx-auto mb-7" />

            <p className="text-lg font-bold text-white text-center mb-1">
              ¿Cómo quedó tu comprensión?
            </p>
            {topicName && (
              <p className="text-sm text-white/40 text-center mb-8">{topicName}</p>
            )}

            <div className="space-y-3">
              {([
                {
                  r: 'red'    as TopicComprehension,
                  emoji: '🔴',
                  label: 'Necesito repasar',
                  sub:   'El tema no quedó claro',
                },
                {
                  r: 'yellow' as TopicComprehension,
                  emoji: '🟡',
                  label: 'Entendí con dudas',
                  sub:   'Me quedaron algunas preguntas',
                },
                {
                  r: 'green'  as TopicComprehension,
                  emoji: '🟢',
                  label: 'Lo domino',
                  sub:   '¡Excelente trabajo!',
                },
              ]).map(({ r, emoji, label, sub }) => (
                <button
                  key={r}
                  onClick={() => handleRate(r)}
                  disabled={saving}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-60"
                  style={{
                    backgroundColor: rating === r
                      ? 'rgba(255,255,255,0.12)'
                      : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${rating === r
                      ? 'rgba(255,255,255,0.25)'
                      : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  <span className="text-2xl">{emoji}</span>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="text-xs text-white/40 mt-0.5">{sub}</p>
                  </div>
                  {saving && rating === r && (
                    <div
                      className="w-4 h-4 rounded-full border-2 border-t-white/80 animate-spin"
                      style={{ borderColor: 'rgba(255,255,255,0.25)', borderTopColor: 'rgba(255,255,255,0.8)' }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Abandon confirmation dialog ───────────────────────────────────── */}
      {showAbandon && (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-6 bg-black/75 backdrop-blur-sm">
          <div
            className="w-full max-w-sm rounded-3xl p-6"
            style={{ backgroundColor: '#1F2937', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <p className="text-base font-bold text-white text-center mb-2">
              ¿Salir del modo foco?
            </p>
            <p className="text-sm text-white/50 text-center mb-6">
              El bloque no se marcará como completado
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAbandon(false)}
                className="flex-1 h-12 rounded-2xl text-sm font-semibold text-white/60"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              >
                Seguir
              </button>
              <button
                onClick={handleConfirmAbandon}
                className="flex-1 h-12 rounded-2xl text-sm font-semibold"
                style={{
                  color: '#F87171',
                  backgroundColor: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.3)',
                }}
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
