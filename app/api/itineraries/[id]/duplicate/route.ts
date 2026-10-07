import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { orgAuth } from '@/lib/auth/org-auth'
import { clientMessage } from '@/lib/api-errors'
import {
  DAY_SELECT, DAY_VERSION_SELECT, ITINERARY_SELECT, SERVICE_SELECT, SERVICE_VERSION_SELECT, VERSION_SELECT,
  copyCode, copyDay, copyDayVersion, copyItinerary, copyService, copyServiceVersion, copyVersion,
} from '@/lib/itineraries/duplicate'

// ============================================
// POST /api/itineraries/[id]/duplicate — a new draft of the same trip
// ============================================
// Copies the itinerary, its days, its services and every language's text
// (what the copy keeps and leaves behind: lib/itineraries/duplicate.ts). Not
// one transaction, so a failure part-way deletes the copy (days, services and
// versions go with it, ON DELETE CASCADE) — never a half trip. orgAuth's
// client is service-role, so the original is looked up within the org.

type Row = Record<string, unknown>

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await orgAuth()
  if (auth.error || !auth.supabase || !auth.org_id) {
    return NextResponse.json({ success: false, error: auth.error ?? 'Unauthorized' }, { status: auth.status })
  }
  const { supabase, org_id, user } = auth
  const { id } = await params

  const { data: found, error: loadError } = await supabase
    .from('itineraries').select(ITINERARY_SELECT).eq('id', id).eq('org_id', org_id).maybeSingle()
  if (loadError) return NextResponse.json({ success: false, error: clientMessage(loadError, 'Could not load the itinerary') }, { status: 500 })
  const original = found as unknown as Row | null
  if (!original) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })

  const [daysRes, versionsRes] = await Promise.all([
    supabase.from('itinerary_days').select(DAY_SELECT).eq('itinerary_id', id).order('day_number'),
    supabase.from('itinerary_versions').select(VERSION_SELECT).eq('itinerary_id', id),
  ])
  if (daysRes.error) return NextResponse.json({ success: false, error: clientMessage(daysRes.error, 'Could not load the days') }, { status: 500 })
  if (versionsRes.error) return NextResponse.json({ success: false, error: clientMessage(versionsRes.error, 'Could not load the translations') }, { status: 500 })
  const days = (daysRes.data ?? []) as unknown as Row[]
  const oldDayIds = days.map(d => String(d.id))

  const [servicesRes, dayVersionsRes] = oldDayIds.length > 0
    ? await Promise.all([
        supabase.from('itinerary_services').select(SERVICE_SELECT).in('itinerary_day_id', oldDayIds),
        supabase.from('itinerary_day_versions').select(DAY_VERSION_SELECT).in('itinerary_day_id', oldDayIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]
  if (servicesRes.error) return NextResponse.json({ success: false, error: clientMessage(servicesRes.error, 'Could not load the services') }, { status: 500 })
  if (dayVersionsRes.error) return NextResponse.json({ success: false, error: clientMessage(dayVersionsRes.error, 'Could not load the translations') }, { status: 500 })
  const services = (servicesRes.data ?? []) as unknown as Row[]
  const oldServiceIds = services.map(s => String(s.id))
  const { data: serviceVersionRows, error: serviceVersionsError } = oldServiceIds.length > 0
    ? await supabase.from('itinerary_service_versions').select(SERVICE_VERSION_SELECT).in('itinerary_service_id', oldServiceIds)
    : { data: [], error: null }
  if (serviceVersionsError) return NextResponse.json({ success: false, error: clientMessage(serviceVersionsError, 'Could not load the translations') }, { status: 500 })

  // The new itinerary; the code is unique, so a collision draws another.
  let copy: { id: string; itinerary_code: string } | null = null
  for (let attempt = 0; attempt < 4 && !copy; attempt++) {
    const code = copyCode(original.itinerary_code as string, new Date().getFullYear(), Math.floor(Math.random() * 9000) + 1000)
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('itineraries')
      .insert({ ...copyItinerary(original, code), org_id, user_id: user?.id ?? null, created_at: now, updated_at: now })
      .select('id, itinerary_code')
      .single()
    if (data) copy = data as { id: string; itinerary_code: string }
    else if (error && error.code !== '23505') {
      return NextResponse.json({ success: false, error: clientMessage(error, 'Could not copy the itinerary') }, { status: 500 })
    }
  }
  if (!copy) return NextResponse.json({ success: false, error: 'Could not find a free itinerary code — try again' }, { status: 500 })
  const made = copy

  const undo = async (message: string) => {
    const { error: cleanupError } = await supabase.from('itineraries').delete().eq('id', made.id)
    // If even the clean-up failed, say so: a part-made copy is on the list.
    const left = cleanupError ? ` A part-made copy (${made.itinerary_code}) could not be removed — delete it by hand.` : ''
    return NextResponse.json({ success: false, error: `${message}${left}` }, { status: 500 })
  }

  // New ids are chosen here, so each translation can follow its day and line.
  const dayIds = new Map(oldDayIds.map(old => [old, randomUUID()]))
  const serviceIds = new Map(oldServiceIds.map(old => [old, randomUUID()]))

  if (days.length > 0) {
    const { error } = await supabase.from('itinerary_days').insert(days.map(d => copyDay(d, made.id, dayIds.get(String(d.id))!)))
    if (error) return undo(clientMessage(error, 'Could not copy the days'))
  }
  const newServices = services
    .map(s => copyService(s, dayIds, serviceIds.get(String(s.id))!))
    .filter((s): s is Row => s !== null)
  if (newServices.length > 0) {
    const { error } = await supabase.from('itinerary_services').insert(newServices)
    if (error) return undo(clientMessage(error, 'Could not copy the services'))
  }

  const versions = ((versionsRes.data ?? []) as unknown as Row[]).map(v => copyVersion(v, made.id))
  const dayVersions = ((dayVersionsRes.data ?? []) as unknown as Row[]).map(v => copyDayVersion(v, dayIds)).filter((v): v is Row => v !== null)
  const serviceVersions = ((serviceVersionRows ?? []) as unknown as Row[]).map(v => copyServiceVersion(v, serviceIds)).filter((v): v is Row => v !== null)
  for (const [table, rows] of [
    ['itinerary_versions', versions],
    ['itinerary_day_versions', dayVersions],
    ['itinerary_service_versions', serviceVersions],
  ] as const) {
    if (rows.length === 0) continue
    const { error } = await supabase.from(table).insert(rows)
    if (error) return undo(clientMessage(error, 'Could not copy the translations'))
  }

  return NextResponse.json({
    success: true,
    data: { id: made.id, itinerary_code: made.itinerary_code, days: days.length, services: newServices.length },
  })
}
