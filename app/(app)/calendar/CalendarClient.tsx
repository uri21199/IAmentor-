'use client'

import { useState } from 'react'
import {
  format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, isSameDay, addMonths, subMonths, getDay,
  differenceInDays, isToday,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { getDaysColor } from '@/lib/study-priority'
import { Badge } from '@/components/ui/Badge'

interface Event {
  id: string
  title: string
  date: string
  type: string
  notes: string | null
  subjects?: { name: string; color: string } | null
}

interface Props {
  events: Event[]
  today: string
}

function parseNotes(notes: string | null) {
  if (!notes) return {}
  try { return JSON.parse(notes) } catch { return { _notes: notes } }
}

const TYPE_LABELS: Record<string, string> = {
  parcial:            'Parcial',
  parcial_intermedio: 'Parcial Int.',
  entrega_tp:         'Entrega TP',
  medico:             'Turno médico',
  personal:           'Personal',
}

const WEEKDAYS = ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D']

export default function CalendarClient({ events, today }: Props) {
  const [viewDate, setViewDate] = useState(new Date(today))
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date(today))

  const monthStart = startOfMonth(viewDate)
  const monthEnd   = endOfMonth(viewDate)
  const days       = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Events indexed by date string for quick lookup
  const eventsByDate = events.reduce<Record<string, Event[]>>((acc, ev) => {
    acc[ev.date] = acc[ev.date] ? [...acc[ev.date], ev] : [ev]
    return acc
  }, {})

  // Leading empty cells (Monday = 0 index, Sunday = 6)
  const firstDow = getDay(monthStart) // 0=Sun, 1=Mon...
  const leadingBlanks = firstDow === 0 ? 6 : firstDow - 1  // shift so Mon is first

  // Events for selected day
  const selectedKey    = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null
  const selectedEvents = selectedKey ? (eventsByDate[selectedKey] || []) : []

  // All events in current month (for the counter)
  const monthEventCount = days.reduce((sum, d) => {
    return sum + (eventsByDate[format(d, 'yyyy-MM-dd')]?.length ?? 0)
  }, 0)

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <p className="text-base font-bold text-text-primary capitalize">
          {format(viewDate, 'MMMM yyyy', { locale: es })}
          {monthEventCount > 0 && (
            <span className="ml-2 text-xs font-medium text-text-secondary">
              {monthEventCount} evento{monthEventCount > 1 ? 's' : ''}
            </span>
          )}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewDate(d => subMonths(d, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-surface-2 border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => { setViewDate(new Date(today)); setSelectedDate(new Date(today)) }}
            className="px-3 h-9 rounded-xl bg-surface-2 border border-border-subtle text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            Hoy
          </button>
          <button
            onClick={() => setViewDate(d => addMonths(d, 1))}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-surface-2 border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="rounded-3xl bg-surface-2 border border-border-subtle overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-border-subtle">
          {WEEKDAYS.map(wd => (
            <div key={wd} className="py-2 text-center text-[10px] font-semibold text-text-secondary">
              {wd}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7">
          {/* Leading blanks */}
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} className="aspect-square" />
          ))}

          {/* Days */}
          {days.map(day => {
            const dateKey   = format(day, 'yyyy-MM-dd')
            const dayEvents = eventsByDate[dateKey] || []
            const isSelected = selectedDate ? isSameDay(day, selectedDate) : false
            const isTodayDay = isToday(day)
            const hasEvents  = dayEvents.length > 0

            // Dot color: use the most urgent event
            const urgentColor = hasEvents
              ? dayEvents.reduce<string>((worst, ev) => {
                  const d = differenceInDays(parseISO(ev.date), new Date())
                  const c = getDaysColor(d)
                  if (c === 'red') return 'red'
                  if (c === 'amber' && worst !== 'red') return 'amber'
                  return worst
                }, 'green')
              : null

            return (
              <button
                key={dateKey}
                onClick={() => setSelectedDate(isSelected ? null : day)}
                className={`aspect-square flex flex-col items-center justify-center gap-0.5 relative transition-all ${
                  isSelected
                    ? 'bg-primary text-white rounded-2xl'
                    : isTodayDay
                      ? 'text-primary font-bold'
                      : 'text-text-primary hover:bg-surface'
                }`}
              >
                <span className={`text-xs font-medium ${isTodayDay && !isSelected ? 'text-primary' : ''}`}>
                  {format(day, 'd')}
                </span>
                {hasEvents && (
                  <div className="flex gap-0.5">
                    {dayEvents.slice(0, 3).map((ev, i) => (
                      <div
                        key={i}
                        className={`w-1 h-1 rounded-full ${
                          isSelected ? 'bg-white/70' :
                          urgentColor === 'red'   ? 'bg-red-400' :
                          urgentColor === 'amber' ? 'bg-amber-400' :
                          'bg-green-400'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected day events */}
      {selectedDate && (
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <p className={`text-sm font-bold ${isToday(selectedDate) ? 'text-primary' : 'text-text-primary'} capitalize`}>
              {isToday(selectedDate)
                ? 'Hoy'
                : format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
            </p>
          </div>

          {selectedEvents.length === 0 ? (
            <div className="rounded-3xl bg-surface-2 border border-border-subtle px-4 py-5 text-center">
              <p className="text-xs text-text-secondary">Sin eventos este día</p>
              <p className="text-[10px] text-text-secondary mt-1">Usá el botón + para agregar uno</p>
            </div>
          ) : (
            <div className="rounded-3xl bg-surface-2 border border-border-subtle overflow-hidden">
              {selectedEvents.map((ev, i) => {
                const extra  = parseNotes(ev.notes)
                const days   = differenceInDays(parseISO(ev.date), new Date())
                const isLast = i === selectedEvents.length - 1

                return (
                  <div
                    key={ev.id}
                    className={`flex items-start gap-3 px-4 py-3.5 ${!isLast ? 'border-b border-border-subtle' : ''}`}
                  >
                    {/* Color dot */}
                    <div
                      className="w-3 h-3 rounded-full mt-0.5 shrink-0"
                      style={{ backgroundColor: ev.subjects?.color || '#6b7280' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-text-primary leading-tight">{ev.title}</p>
                        <Badge variant={
                          days <= 0 ? 'danger' : days <= 7 ? 'warning' : 'success'
                        }>
                          {days <= 0 ? 'Hoy' : days === 1 ? 'Mañana' : `${days}d`}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-[10px] text-text-secondary bg-surface px-2 py-0.5 rounded-full border border-border-subtle">
                          {TYPE_LABELS[ev.type] ?? ev.type}
                        </span>
                        {extra.time && (
                          <span className="text-xs text-text-secondary flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {extra.time}
                          </span>
                        )}
                        {extra.aula && (
                          <span className="text-xs text-text-secondary flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {extra.aula}
                          </span>
                        )}
                        {ev.subjects?.name && (
                          <span className="text-xs text-text-secondary">{ev.subjects.name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
