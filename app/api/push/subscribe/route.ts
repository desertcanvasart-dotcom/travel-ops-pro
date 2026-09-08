import { NextRequest, NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'

/**
 * Save / remove this browser's push subscription. Session-gated (the ops board
 * is office-only); the endpoint's UNIQUE constraint makes re-subscribing from
 * the same browser an upsert, not a duplicate.
 */

export async function POST(request: NextRequest) {
  try {
    const auth = await orgAuth()
    if (auth.error || !auth.supabase || !auth.org_id) {
      return NextResponse.json({ success: false, error: auth.error ?? 'Unauthorized' }, { status: auth.status })
    }
    const body = await request.json()
    const endpoint = body?.subscription?.endpoint
    const p256dh = body?.subscription?.keys?.p256dh
    const authKey = body?.subscription?.keys?.auth
    if (
      typeof endpoint !== 'string' || !endpoint.startsWith('https://') ||
      typeof p256dh !== 'string' || !p256dh ||
      typeof authKey !== 'string' || !authKey
    ) {
      return NextResponse.json({ success: false, error: 'Invalid subscription' }, { status: 400 })
    }
    const { error } = await auth.supabase
      .from('push_subscriptions')
      .upsert(
        { org_id: auth.org_id, user_id: auth.user?.id ?? null, endpoint, p256dh, auth: authKey },
        { onConflict: 'endpoint' }
      )
    if (error) {
      console.error('[push subscribe]', error.message)
      return NextResponse.json({ success: false, error: 'Failed to save subscription' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[push subscribe]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await orgAuth()
    if (auth.error || !auth.supabase || !auth.org_id) {
      return NextResponse.json({ success: false, error: auth.error ?? 'Unauthorized' }, { status: auth.status })
    }
    const body = await request.json()
    const endpoint = body?.endpoint
    if (typeof endpoint !== 'string' || !endpoint) {
      return NextResponse.json({ success: false, error: 'endpoint required' }, { status: 400 })
    }
    const { error } = await auth.supabase
      .from('push_subscriptions')
      .delete()
      .eq('org_id', auth.org_id)
      .eq('endpoint', endpoint)
    if (error) {
      console.error('[push unsubscribe]', error.message)
      return NextResponse.json({ success: false, error: 'Failed to remove subscription' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[push unsubscribe]', err)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
