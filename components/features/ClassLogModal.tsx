'use client'

import React from 'react'
import { format, parseISO } from 'date-fns'
import Button from '@/components/ui/Button'
import type { Topic, AcademicEvent } from '@/types'

export interface ClassLogFormData {
  understanding_level: number
  has_homework: boolean
  homework_description: string
  due_date: string
  topics_covered: string[]
}

interface Props {
  isEditing: boolean
  localUnits: Array<{ id: string; name: string }>
  unitTopics: Record<string, Topic[]>
  allTopics: Topic[]
  upcomingEvts: AcademicEvent[]
  classLogData: ClassLogFormData
  classLogOpenUnitId: string | null
  classLogUnitRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>
  quickAddUnitId: string | null
  quickTopicName: string
  quickAdding: boolean
  linkedEventId: string
  logLoading: boolean
  onClose: () => void
  onSave: () => void
  onClassLogDataChange: React.Dispatch<React.SetStateAction<ClassLogFormData>>
  onSetOpenUnit: (id: string | null) => void
  onToggleTopic: (id: string) => void
  onQuickAddTopic: (unitId: string) => void
  onSetQuickAddUnit: (id: string | null) => void
  onSetQuickTopicName: (name: string) => void
  onSetLinkedEventId: (id: string) => void
}

export default function ClassLogModal({
  isEditing,
  localUnits,
  unitTopics,
  allTopics,
  upcomingEvts,
  classLogData,
  classLogOpenUnitId,
  classLogUnitRefs,
  quickAddUnitId,
  quickTopicName,
  quickAdding,
  linkedEventId,
  logLoading,
  onClose,
  onSave,
  onClassLogDataChange,
  onSetOpenUnit,
  onToggleTopic,
  onQuickAddTopic,
  onSetQuickAddUnit,
  onSetQuickTopicName,
  onSetLinkedEventId,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-6 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-2xl max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-subtle shrink-0">
          <h3 className="text-base font-semibold text-text-primary">
            {isEditing ? 'Editar clase' : 'Post-clase'}
          </h3>
          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-3">
          {/* Topic selector */}
          {allTopics.length === 0 ? (
            <div className="rounded-2xl bg-surface-2 border border-border-subtle px-4 py-3">
              <p className="text-xs text-text-secondary mb-2">
                Aún no hay temas en el temario. Podés agregar uno ahora:
              </p>
              {localUnits.length > 0 ? (
                quickAddUnitId === null ? (
                  <button
                    onClick={() => onSetQuickAddUnit(localUnits[0].id)}
                    className="text-xs text-primary"
                  >+ Agregar primer tema</button>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={quickTopicName}
                      onChange={e => onSetQuickTopicName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') onQuickAddTopic(quickAddUnitId) }}
                      placeholder="Nombre del tema..."
                      autoFocus
                      className="flex-1 h-9 px-3 rounded-xl bg-surface border border-border-subtle text-sm text-text-primary placeholder-text-secondary focus:outline-none"
                    />
                    <button onClick={() => onQuickAddTopic(quickAddUnitId)} disabled={!quickTopicName.trim() || quickAdding} className="px-3 h-9 rounded-xl bg-primary text-white text-xs disabled:opacity-40">
                      {quickAdding ? '…' : '✓'}
                    </button>
                  </div>
                )
              ) : (
                <p className="text-xs text-text-secondary italic">Primero creá unidades en el temario.</p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-medium text-text-secondary">Temas vistos en clase</p>
                {classLogData.topics_covered.length > 0 && (
                  <span className="text-xs text-primary font-medium">
                    {classLogData.topics_covered.length} seleccionado{classLogData.topics_covered.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="rounded-2xl border border-border-subtle overflow-hidden divide-y divide-border-subtle">
                {localUnits.filter(u => (unitTopics[u.id] || []).length > 0).map(unit => {
                  const unitTopicsArr = unitTopics[unit.id] || []
                  const isOpen = classLogOpenUnitId === unit.id
                  const selInUnit = unitTopicsArr.filter(t => classLogData.topics_covered.includes(t.id)).length
                  const allSel = selInUnit === unitTopicsArr.length && unitTopicsArr.length > 0
                  return (
                    <div key={unit.id} className="bg-surface-2" ref={el => { classLogUnitRefs.current[unit.id] = el }}>
                      <button
                        type="button"
                        onClick={() => onSetOpenUnit(isOpen ? null : unit.id)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left"
                      >
                        <span className="text-sm text-text-primary font-medium truncate pr-2">{unit.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {selInUnit > 0 && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                              {selInUnit}/{unitTopicsArr.length}
                            </span>
                          )}
                          <svg
                            className={`w-4 h-4 text-text-secondary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-3 bg-surface/40">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] text-text-secondary">{unitTopicsArr.length} tema{unitTopicsArr.length !== 1 ? 's' : ''}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const ids = unitTopicsArr.map(t => t.id)
                                if (allSel) {
                                  onClassLogDataChange(d => ({ ...d, topics_covered: d.topics_covered.filter(id => !ids.includes(id)) }))
                                } else {
                                  onClassLogDataChange(d => ({ ...d, topics_covered: Array.from(new Set([...d.topics_covered, ...ids])) }))
                                }
                              }}
                              className="text-[10px] font-medium text-primary"
                            >
                              {allSel ? 'Desmarcar todos' : 'Seleccionar todos'}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {unitTopicsArr.map(topic => {
                              const sel = classLogData.topics_covered.includes(topic.id)
                              return (
                                <button
                                  key={topic.id}
                                  type="button"
                                  onClick={() => onToggleTopic(topic.id)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                    sel
                                      ? 'border-primary bg-primary/20 text-text-primary'
                                      : 'border-border-subtle bg-surface text-text-secondary'
                                  }`}
                                >
                                  {sel && '✓ '}{topic.name}
                                </button>
                              )
                            })}
                          </div>
                          {quickAddUnitId === unit.id ? (
                            <div className="flex gap-2 mt-2">
                              <input
                                type="text"
                                value={quickTopicName}
                                onChange={e => onSetQuickTopicName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') onQuickAddTopic(unit.id)
                                  if (e.key === 'Escape') { onSetQuickAddUnit(null); onSetQuickTopicName('') }
                                }}
                                placeholder="Nuevo tema..."
                                autoFocus
                                className="flex-1 h-8 px-3 rounded-xl bg-surface border border-primary/50 text-xs text-text-primary placeholder-text-secondary focus:outline-none"
                              />
                              <button onClick={() => onQuickAddTopic(unit.id)} disabled={!quickTopicName.trim() || quickAdding} className="w-8 h-8 flex items-center justify-center rounded-xl bg-primary/20 text-primary text-sm font-bold disabled:opacity-40">{quickAdding ? '…' : '✓'}</button>
                              <button onClick={() => { onSetQuickAddUnit(null); onSetQuickTopicName('') }} className="w-8 h-8 flex items-center justify-center rounded-xl bg-surface text-text-secondary text-xs">✕</button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { onSetQuickAddUnit(unit.id); onSetQuickTopicName('') }}
                              className="mt-2 flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                              </svg>
                              Agregar tema
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Understanding level */}
          <div className="rounded-2xl bg-surface-2 border border-border-subtle p-4">
            <p className="text-xs text-text-secondary mb-2.5">Nivel de comprensión en clase</p>
            <div className="flex gap-2">
              {[
                { v: 1, label: 'Muy poco' },
                { v: 2, label: 'Poco' },
                { v: 3, label: 'Regular' },
                { v: 4, label: 'Bien' },
                { v: 5, label: 'Muy bien' },
              ].map(l => (
                <button
                  key={l.v}
                  onClick={() => onClassLogDataChange(d => ({ ...d, understanding_level: l.v }))}
                  className={`flex-1 py-2 rounded-xl border text-xs font-semibold transition-all ${
                    classLogData.understanding_level === l.v
                      ? 'border-primary bg-primary/20 text-primary'
                      : 'border-border-subtle bg-surface text-text-secondary'
                  }`}
                >
                  {['😕','😐','🙂','😊','🤩'][l.v - 1]}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-text-secondary text-center mt-1.5">
              {['Muy poco','Poco','Regular','Bien','Muy bien'][classLogData.understanding_level - 1]}
            </p>
          </div>

          {/* Homework toggle */}
          <div className="rounded-2xl bg-surface-2 border border-border-subtle overflow-hidden">
            <button
              onClick={() => { onClassLogDataChange(d => ({ ...d, has_homework: !d.has_homework })); onSetLinkedEventId('') }}
              className="flex items-center justify-between w-full px-4 py-3"
            >
              <span className="text-sm text-text-primary">Quedó tarea / TP</span>
              <div className={`w-11 h-6 rounded-full transition-colors ${classLogData.has_homework ? 'bg-primary' : 'bg-surface'} border border-border-subtle relative`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${classLogData.has_homework ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </button>
            {classLogData.has_homework && (
              <>
                <div className="border-t border-border-subtle flex items-start gap-3 px-4 py-3">
                  <svg className="w-4 h-4 text-text-secondary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <textarea
                    value={classLogData.homework_description}
                    onChange={e => onClassLogDataChange(d => ({ ...d, homework_description: e.target.value }))}
                    placeholder="Describí la tarea..."
                    rows={2}
                    className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-secondary resize-none focus:outline-none"
                  />
                </div>
                {upcomingEvts.length > 0 && (
                  <div className="border-t border-border-subtle flex items-center gap-3 px-4 py-3">
                    <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <select
                      value={linkedEventId}
                      onChange={e => {
                        const ev = upcomingEvts.find(ev => ev.id === e.target.value)
                        onSetLinkedEventId(e.target.value)
                        if (ev) onClassLogDataChange(d => ({
                          ...d,
                          due_date: ev.date,
                          homework_description: d.homework_description || ev.title,
                        }))
                      }}
                      className="flex-1 bg-transparent text-sm text-text-primary focus:outline-none"
                    >
                      <option value="">Relacionar con fecha existente (opcional)</option>
                      {upcomingEvts.map(ev => (
                        <option key={ev.id} value={ev.id}>
                          {ev.title} — {format(parseISO(ev.date), 'dd/MM')}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="border-t border-border-subtle flex items-center gap-3 px-4 py-3">
                  <svg className="w-4 h-4 text-text-secondary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span className="text-sm text-text-secondary w-24 shrink-0">Fecha entrega</span>
                  <input
                    type="date"
                    value={classLogData.due_date}
                    onChange={e => { onClassLogDataChange(d => ({ ...d, due_date: e.target.value })); onSetLinkedEventId('') }}
                    className="flex-1 bg-transparent text-sm text-text-primary text-right focus:outline-none"
                  />
                </div>
                <div className="px-4 pb-2">
                  {linkedEventId
                    ? <p className="text-xs text-green-400/80">Vinculado a fecha existente</p>
                    : <p className="text-xs text-primary/70">Crea un evento de entrega automáticamente</p>
                  }
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-3 px-5 pb-5 shrink-0">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" className="flex-1" onClick={onSave} loading={logLoading}>
            {isEditing ? 'Guardar cambios' : 'Guardar clase'}
          </Button>
        </div>
      </div>
    </div>
  )
}
