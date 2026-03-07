import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getTodayEvents, refreshAccessToken } from '@/lib/google-calendar'

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: integration } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google_calendar')
      .single()

    if (!integration) {
      return NextResponse.json({ events: [], connected: false })
    }

    let accessToken = integration.access_token

    // Refresh if expired
    if (integration.token_expiry && new Date(integration.token_expiry) < new Date()) {
      accessToken = await refreshAccessToken(integration.refresh_token)
      await supabase
        .from('user_integrations')
        .update({
          access_token: accessToken,
          token_expiry: new Date(Date.now() + 3600000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id)
    }

    const events = await getTodayEvents(accessToken, integration.refresh_token)

    return NextResponse.json({ events, connected: true })
  } catch (err: any) {
    console.error('Calendar events error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
