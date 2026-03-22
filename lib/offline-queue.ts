// Offline mutation queue — persists in localStorage, retries on reconnect
// Only for non-critical mutations that should survive network loss.

export interface QueuedOperation {
  id: string
  url: string
  method: string
  body: Record<string, unknown>
  createdAt: string
}

const STORAGE_KEY = 'iamentor_offline_queue'

function load(): QueuedOperation[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function save(ops: QueuedOperation[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ops))
}

export function enqueueOperation(url: string, method: string, body: Record<string, unknown>) {
  const op: QueuedOperation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url,
    method,
    body,
    createdAt: new Date().toISOString(),
  }
  save([...load(), op])
  return op.id
}

export function getPendingCount(): number {
  return load().length
}

export async function processQueue(): Promise<{ processed: number; failed: number }> {
  const ops = load()
  if (ops.length === 0) return { processed: 0, failed: 0 }

  let processed = 0
  let failed = 0
  const remaining: QueuedOperation[] = []

  for (const op of ops) {
    try {
      const res = await fetch(op.url, {
        method: op.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(op.body),
      })
      if (res.ok) {
        processed++
      } else {
        remaining.push(op)
        failed++
      }
    } catch {
      remaining.push(op)
      failed++
    }
  }

  save(remaining)
  return { processed, failed }
}

export function clearQueue() {
  save([])
}

/**
 * Wraps a fetch call: executes immediately if online, queues if offline.
 * Returns { ok: true } optimistically when queued.
 */
export async function fetchOrQueue(
  url: string,
  method: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; queued?: boolean }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueOperation(url, method, body)
    return { ok: true, queued: true }
  }
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { ok: res.ok }
  } catch {
    // Network error while supposedly online — queue anyway
    enqueueOperation(url, method, body)
    return { ok: true, queued: true }
  }
}
