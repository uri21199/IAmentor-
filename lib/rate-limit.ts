/**
 * Rate limiting helper using Upstash Redis + @upstash/ratelimit.
 *
 * Setup required:
 *   npm install @upstash/ratelimit @upstash/redis
 *   UPSTASH_REDIS_REST_URL=...
 *   UPSTASH_REDIS_REST_TOKEN=...
 *
 * If env vars are not set, rate limiting is skipped (safe fallback for local dev).
 */

import { NextResponse } from 'next/server'

// Lazy imports — only evaluated when env vars are present
let ratelimitInstances: Map<string, any> | null = null

async function getInstances(): Promise<Map<string, any> | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null
  }
  if (ratelimitInstances) return ratelimitInstances

  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — optional peer dependency, not installed until Upstash is configured
    const { Redis }     = await import('@upstash/redis')
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const { Ratelimit } = await import('@upstash/ratelimit')

    const redis = new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })

    ratelimitInstances = new Map([
      // 10 plan generations per user per day
      ['plan',           new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '1 d'), prefix: 'rl:plan' })],
      // 5 replans per user per day
      ['replan',         new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '1 d'),  prefix: 'rl:replan' })],
      // 3 syllabus parses per user per day
      ['parse-syllabus', new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, '1 d'),  prefix: 'rl:syllabus' })],
      // 5 event parses per user per day
      ['parse-events',   new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '1 d'),  prefix: 'rl:events' })],
      // 3 weekly insights per user per day
      ['weekly-insight', new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, '1 d'),  prefix: 'rl:insight' })],
      // 3 weekly plans per user per day
      ['weekly-plan',    new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, '1 d'),  prefix: 'rl:weekly-plan' })],
    ])
    return ratelimitInstances
  } catch {
    return null
  }
}

/**
 * Check rate limit for a given endpoint and user.
 * Returns a 429 NextResponse if the limit is exceeded, or null if allowed.
 */
export async function checkRateLimit(
  endpoint: string,
  userId: string
): Promise<NextResponse | null> {
  const instances = await getInstances()
  if (!instances) return null // Upstash not configured — skip

  const limiter = instances.get(endpoint)
  if (!limiter) return null

  const { success, limit, remaining, reset } = await limiter.limit(userId)
  if (success) return null

  return NextResponse.json(
    {
      error: 'Demasiadas solicitudes. Intenta de nuevo mas tarde.',
      limit,
      remaining,
      reset: new Date(reset).toISOString(),
    },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit':     String(limit),
        'X-RateLimit-Remaining': String(remaining),
        'X-RateLimit-Reset':     String(reset),
        'Retry-After':           String(Math.ceil((reset - Date.now()) / 1000)),
      },
    }
  )
}
