'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import type { ToastMessage } from '@/types'

interface ToastContextValue {
  addToast: (msg: Omit<ToastMessage, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TOAST_DURATION_MS = 4000

function ToastContainer({ toasts, onRemove }: { toasts: ToastMessage[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-24 inset-x-0 z-[70] flex flex-col items-end gap-2 px-4 pointer-events-none">
      {toasts.map(t => (
        <button
          key={t.id}
          onClick={() => onRemove(t.id)}
          className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-lg pointer-events-auto max-w-sm w-full text-left backdrop-blur-sm ${
            t.type === 'error'   ? 'bg-red-500/90' :
            t.type === 'success' ? 'bg-green-500/90' :
            t.type === 'warning' ? 'bg-amber-500/90' :
                                   'bg-blue-500/90'
          }`}
        >
          <p className="text-sm font-medium text-white flex-1">{t.message}</p>
          <svg className="w-3.5 h-3.5 text-white/70 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ))}
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((msg: Omit<ToastMessage, 'id'>) => {
    const id = Math.random().toString(36).slice(2, 9)
    setToasts(prev => [...prev, { ...msg, id }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), TOAST_DURATION_MS)
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
