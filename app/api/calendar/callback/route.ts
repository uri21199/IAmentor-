import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getTokensFromCode } from '@/lib/google-calendar'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/settings?error=calendar_denied', req.url))
  }

  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    const tokens = await getTokensFromCode(code)

    await supabase.from('user_integrations').upsert({
      user_id: user.id,
      provider: 'google_calendar',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })

    return NextResponse.redirect(new URL('/settings?success=calendar_connected', req.url))
  } catch (err) {
    console.error('Calendar callback error:', err)
    return NextResponse.redirect(new URL('/settings?error=calendar_failed', req.url))
  }
}
