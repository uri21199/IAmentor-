'use client'

import { useEffect, useState } from 'react'
import { processQueue, getPendingCount } from '@/lib/offline-queue'

export default function OfflineIndicator() {
  const [isOnline, setIsOnline]   = useState(true)
  const [syncing, setSyncing]     = useState(false)
  const [syncedCount, setSyncedCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [showSynced, setShowSynced] = useState(false)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    setPendingCount(getPendingCount())

    function handleOffline() {
      setIsOnline(false)
      setPendingCount(getPendingCount())
    }

    async function handleOnline() {
      setIsOnline(true)
      const pending = getPendingCount()
      if (pending > 0) {
        setSyncing(true)
        const { processed } = await processQueue()
        setSyncing(false)
        if (processed > 0) {
          setSyncedCount(processed)
          setShowSynced(true)
          setTimeout(() => setShowSynced(false), 3000)
        }
      }
      setPendingCount(getPendingCount())
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online',  handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online',  handleOnline)
    }
  }, [])

  if (isOnline && !syncing && !showSynced) return null

  if (showSynced) {
    return (
      <div className="fixed top-0 inset-x-0 z-[60] flex items-center justify-center px-4 py-2 bg-green-500/90 backdrop-blur-sm">
        <svg className="w-4 h-4 text-white mr-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <p className="text-sm font-medium text-white">
          {syncedCount} cambio{syncedCount !== 1 ? 's' : ''} sincronizado{syncedCount !== 1 ? 's' : ''}
        </p>
      </div>
    )
  }

  if (syncing) {
    return (
      <div className="fixed top-0 inset-x-0 z-[60] flex items-center justify-center px-4 py-2 bg-blue-500/90 backdrop-blur-sm">
        <svg className="w-4 h-4 text-white mr-2 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <p className="text-sm font-medium text-white">Sincronizando cambios...</p>
      </div>
    )
  }

  // Offline
  return (
    <div className="fixed top-0 inset-x-0 z-[60] flex items-center justify-center px-4 py-2 bg-amber-500/90 backdrop-blur-sm">
      <svg className="w-4 h-4 text-white mr-2 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M12 12h.01M3 3l18 18" />
      </svg>
      <p className="text-sm font-medium text-white">
        Modo offline
        {pendingCount > 0 && ` — ${pendingCount} cambio${pendingCount !== 1 ? 's' : ''} pendiente${pendingCount !== 1 ? 's' : ''}`}
        {' '}— se sincronizará cuando vuelvas a conectarte
      </p>
    </div>
  )
}
