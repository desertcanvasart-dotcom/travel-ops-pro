import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim().replace(/^["']|["']$/g,'')]))
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const org = (await svc.from('organizations').select('id').ilike('name','E2E Smoke Org').single()).data.id
const itin = (await svc.from('itineraries').select('id').eq('org_id',org).limit(1).single()).data.id
const bk = await svc.from('bookings').insert({ org_id:org, booking_code:'ZZ-LIVEPROBE', itinerary_id:itin, client_name:'T', trip_name:'T', num_adults:1, num_children:0, portal_mode:'family', start_date:'2026-12-01', end_date:'2026-12-05', payment_schedule_overridden:false, status:'confirmed' }).select('id').single()
const bookingId = bk.data.id
const api = await (await (await chromium.launch()).newContext({ storageState:'e2e/.auth/user.json', baseURL:'https://autoura.net' })).newPage().then(p=>p.request)
// poll until the coordinator route stops 404ing (new build live)
let live=false
for (let i=0;i<40;i++){ const r=await api.get(`/api/bookings/${bookingId}/coordinator`); if(r.status()!==404){live=true;break} await new Promise(r=>setTimeout(r,15000)) }
console.log('coordinator route live:', live)
const put = await api.put(`/api/bookings/${bookingId}`, { data:{ portal_mode:'friends' } })
const after = (await svc.from('bookings').select('portal_mode').eq('id',bookingId).single()).data.portal_mode
console.log('portal_mode persisted after PUT:', after==='friends' ? 'YES (fresh build live)' : 'NO (still stale)')
await svc.from('bookings').delete().eq('id',bookingId)
