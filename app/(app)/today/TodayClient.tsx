'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO, differenceInDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { TimeBlock } from '@/components/ui/TimeBlock'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import Button from '@/components/ui/Button'
import NotificationBanner from '@/components/features/NotificationBanner'
import { getGreeting, stressLabel } from '@/lib/utils'
import { getDaysColor as getColor } from '@/lib/study-priority'
import type { CheckIn, DailyPlan, TimeBlock as TimeBlockType, AppNotification } from '@/types'

interface Props {
  user: { id: string; email?: string }
  checkin: CheckIn | null
  plan: DailyPlan | null
  upcomingEvents: any[]
  energyHistory: { date: string; energy_level: number }[]
  today: string
  previewBlocks?: TimeBlockType[]
  /** Passed from page.tsx searchParams: 'replan' triggers auto-replan on mount */
  actionParam?: string
}

export default function TodayClient({
  user,
  checkin,
  plan,
  upcomingEvents,
  energyHistory,
  today,
  previewBlocks = [],
  actionParam,
}: Props) {
  const router = useRouter()

  const [blocks, setBlocks] = useState<TimeBlockType[]>(plan?.plan_json || [])
  const [generating, setGenerating] = useState(false)
  const [completion, setCompletion] = useState(plan?.completion_percentage || 0)
  const [notifications, setNotifications] = useState<AppNotification[]>([])

  const greeting = getGreeting()
  const dateLabel = format(parseISO(today), "EEEE d 'de' MMMM", { locale: es })

  // ── Fetch & process notifications once on mount ───────────────────────────
  useEffect(() => {
    async function fetchNotifications() {
      try {
        const res = await fetch('/api/notifications')
        if (!res.ok) return
        const data = await res.json()
        setNotifications(data.notifications ?? [])
      } catch {
        // non-blocking — no notifications is fine
      }
    }
    fetchNotifications()
  }, [])

  // ── Auto-replan when landing on /today?action=replan ──────────────────────
  useEffect(() => {
    if (actionParam === 'replan' && blocks.length > 0) {
      handleReplan()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionParam])

  // ── Mark notification as read → returns target_path from server ───────────
  const markRead = useCallback(async (id: string): Promise<string | null> => {
    setNotifications(prev => prev.filter(n => n.id !== id))
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'PATCH' })
      if (!res.ok) return null
      const data = await res.json()
      return data.target_path ?? null
    } catch {
      return null
    }
  }, [])

  // Called when user clicks the action button (e.g. "Ver materia", "Replanificar")
  const handleNotificationAction = useCallback(async (id: string, targetPath: string | null) => {
    const serverPath = await markRead(id)
    const destination = serverPath ?? targetPath

    if (!destination) return

    // Energy boost: replan in-place — no need to navigate away
    if (destination === '/today?action=replan') {
      await handleReplan()
      return
    }

    router.push(destination)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markRead, router])

  // Called when user clicks ✕ (dismiss without action)
  const handleNotificationDismiss = useCallback(async (id: string) => {
    await markRead(id)
  }, [markRead])

  // ── Generate plan ─────────────────────────────────────────────────────────
  async function generatePlan() {
    setGenerating(true)
    try {
      const res = await fetch('/api/ai/plan', { method: 'POST' })
      if (!res.ok) throw new Error('Error al generar el plan')
      const data = await res.json()
      setBlocks(data.blocks)
    } catch (err) {
      console.error(err)
    } finally {
      setGenerating(false)
    }
  }

  // ── Replan (triggered by energy_boost notification) ───────────────────────
  async function handleReplan() {
    setGenerating(true)
    try {
      const res = await fetch('/api/ai/replan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          change: 'Tengo más energía de lo esperado y quiero una sesión más productiva',
        }),
      })
      if (!res.ok) throw new Error('Error al replanificar')
      const data = await res.json()
      if (data.blocks?.length) setBlocks(data.blocks)
    } catch (err) {
      console.error(err)
    } finally {
      setGenerating(false)
    }
  }

  // ── Toggle block completion ───────────────────────────────────────────────
  async function toggleBlock(id: string, completed: boolean) {
    const updated = blocks.map(b => b.id === id ? { ...b, completed } : b)
    setBlocks(updated)

    const completedCount = updated.filter(b => b.completed).length
    const pct = updated.length > 0 ? Math.round((completedCount / updated.length) * 100) : 0
    setCompletion(pct)

    await fetch('/api/plan/update-block', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, blocks: updated, completion_percentage: pct }),
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="px-4 pt-6 pb-4 space-y-5 max-w-lg mx-auto">

      {/* Header */}
      <div>
        <p className="text-text-secondary text-sm capitalize">{dateLabel}</p>
        <h1 className="text-2xl font-bold text-text-primary mt-1">
          {greeting} 👋
        </h1>
      </div>

      {/* ── Notification banners ───────────────────────────────────────────── */}
      <NotificationBanner
        notifications={notifications}
        onAction={handleNotificationAction}
        onDismiss={handleNotificationDismiss}
      />

      {/* Check-in status / CTA */}
      {!checkin ? (
        <div className="gradient-card border border-primary/20 rounded-3xl p-5">
          <p className="text-sm text-text-secondary mb-1">Sin check-in matutino</p>
          <p className="text-text-primary font-medium mb-4">
            Completá tu check-in para que la IA genere tu plan personalizado
          </p>
          <Link href="/checkin">
            <Button variant="primary" size="md" className="w-full">
              Hacer check-in ahora ✅
            </Button>
          </Link>
        </div>
      ) : (
        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Check-in del día</CardTitle>
            <Badge variant="success">Completado</Badge>
          </CardHeader>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-2xl">
                {['🪫','😮‍💨','⚡','🔥','🚀'][checkin.energy_level - 1]}
              </p>
              <p className="text-xs text-text-secondary mt-1">Energía {checkin.energy_level}/5</p>
            </div>
            <div className="text-center">
              <p className="text-2xl">
                {['😴','😕','😐','🙂','😁'][checkin.sleep_quality - 1]}
              </p>
              <p className="text-xs text-text-secondary mt-1">Sueño {checkin.sleep_quality}/5</p>
            </div>
            <div className="text-center">
              <p className="text-2xl">
                {checkin.stress_level === 'low' ? '😌' : checkin.stress_level === 'medium' ? '😤' : '😰'}
              </p>
              <p className="text-xs text-text-secondary mt-1">{stressLabel(checkin.stress_level)}</p>
            </div>
          </div>

          {checkin.travel_route_json.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border-subtle">
              <p className="text-xs text-text-secondary mb-1.5">🚌 Ruta del día</p>
              <div className="space-y-1">
                {checkin.travel_route_json.map((seg, i) => (
                  <p key={i} className="text-xs text-text-primary">
                    {seg.origin} → {seg.destination} ({seg.duration_minutes}min)
                  </p>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Preview blocks (when no check-in but fixed schedule exists) */}
      {!checkin && previewBlocks.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-base font-semibold text-text-primary">Tu día de hoy</h2>
            <span className="px-2 py-0.5 rounded-full bg-surface-2 border border-border-subtle text-text-secondary text-xs">
              Vista previa
            </span>
          </div>
          <p className="text-xs text-text-secondary mb-3">
            Tus bloques fijos (trabajo y clases). Completá el check-in para que la IA personalice el resto.
          </p>
          <div className="space-y-2 pointer-events-none opacity-60">
            {previewBlocks.map(block => (
              <TimeBlock key={block.id} block={block} onToggle={() => {}} />
            ))}
          </div>
        </div>
      )}

      {/* Daily plan (only when check-in is done) */}
      {checkin && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-text-primary">Plan del día</h2>
            {blocks.length > 0 && (
              <span className="text-sm text-text-secondary">{Math.round(completion)}% completado</span>
            )}
          </div>

          {blocks.length > 0 && (
            <ProgressBar value={completion} color="primary" size="sm" className="mb-4" />
          )}

          {blocks.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-4xl mb-3">🤖</p>
              <p className="text-text-secondary text-sm mb-4">
                La IA puede generar tu plan personalizado
              </p>
              <Button
                variant="primary"
                onClick={generatePlan}
                loading={generating}
                disabled={generating}
              >
                Generar plan con IA ✨
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {blocks.map(block => (
                <TimeBlock
                  key={block.id}
                  block={block}
                  onToggle={toggleBlock}
                />
              ))}

              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2 text-text-secondary"
                onClick={generatePlan}
                loading={generating}
              >
                🔄 Regenerar plan
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Upcoming academic events */}
      {upcomingEvents.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-text-primary mb-3">Próximas fechas 📅</h2>
          <div className="space-y-2">
            {upcomingEvents.map((event: any) => {
              const days = differenceInDays(parseISO(event.date), new Date())
              const color = getColor(days)
              return (
                <div
                  key={event.id}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-surface border border-border-subtle"
                >
                  <div className={`w-2 h-2 rounded-full ${color === 'red' ? 'bg-red-500' : color === 'amber' ? 'bg-amber-500' : 'bg-green-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{event.title}</p>
                    <p className="text-xs text-text-secondary">{event.subjects?.name}</p>
                  </div>
                  <Badge variant={color === 'red' ? 'danger' : color === 'amber' ? 'warning' : 'success'}>
                    {days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `${days}d`}
                  </Badge>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Energy sparkline */}
      {energyHistory.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Energía esta semana ⚡</CardTitle>
          </CardHeader>
          <div className="flex items-end gap-1 h-10">
            {[...energyHistory].reverse().map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div
                  className="w-full rounded-t bg-primary/60"
                  style={{ height: `${(h.energy_level / 5) * 100}%`, minHeight: 4 }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            {[...energyHistory].reverse().map((h, i) => (
              <span key={i} className="flex-1 text-center text-[9px] text-text-secondary">
                {format(parseISO(h.date), 'EEE', { locale: es }).slice(0, 2)}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Settings shortcut */}
      <div className="flex justify-end">
        <Link href="/settings" className="text-sm text-text-secondary hover:text-text-primary transition-colors">
          ⚙️ Configuración
        </Link>
      </div>
    </div>
  )
}
