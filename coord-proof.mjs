import { createClient } from '@supabase/supabase-js'
import { chromium } from '@playwright/test'
import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim().replace(/^["']|["']$/g,'')]))
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const org = (await svc.from('organizations').select('id').ilike('name','E2E Smoke Org').single()).data.id
const itin = (await svc.from('itineraries').select('id').eq('org_id',org).limit(1).single()).data.id
const bk = await svc.from('bookings').insert({ org_id:org, booking_code:'ZZ-COORD-TEST', itinerary_id:itin, client_name:'Tanaka', trip_name:'ZZ Coord', num_adults:2, num_children:0, portal_mode:'family', start_date:'2026-12-01', end_date:'2026-12-05', payment_schedule_overridden:false, status:'confirmed' }).select('id').single()
const bookingId = bk.data.id
const mkPax=(f,l,lead)=>svc.from('booking_passengers').insert({org_id:org,booking_id:bookingId,first_name:f,last_name:l,is_lead_passenger:lead,passenger_type:'adult'}).select('id').single()
const p1=(await mkPax('Taro','Tanaka',true)).data.id
const p2=(await mkPax('Jiro','Suzuki',false)).data.id
console.log('fixture: family-mode booking + P1 Tanaka(lead) + P2 Suzuki, no DOBs\n')
const api = await (await (await chromium.launch()).newContext({ storageState:'e2e/.auth/user.json', baseURL:'https://autoura.net' })).newPage().then(p=>p.request)
let fails=0; const R=(l,c)=>{ if(!c)fails++; console.log(`  ${c?'PASS':'*** FAIL'}  ${l}`) }
const J=async r=>{try{return await r.json()}catch{return {}}}

await api.put(`/api/bookings/${bookingId}`, { data:{ portal_mode:'friends' } })
let cd = await J(await api.get(`/api/bookings/${bookingId}/coordinator`))
R('mode toggled to friends', cd.portalMode==='friends')
R('coordinator lists both travellers', cd.travellers?.length===2)
R('0 of 2 submitted', cd.submittedCount===0 && cd.bookedCount===2)

await api.patch(`/api/bookings/${bookingId}/passengers/${p2}`, { data:{ date_of_birth:'1985-11-20', email:'zz-suzuki@example.test' } })
const p2db=(await svc.from('booking_passengers').select('date_of_birth,email').eq('id',p2).single()).data
R('roster seed saved P2 DOB + email', p2db.date_of_birth==='1985-11-20' && p2db.email==='zz-suzuki@example.test')

const sent = await J(await api.post(`/api/bookings/${bookingId}/portal-link`, { data:{ passenger_id:p2, send:true } }))
R('send returned a private link URL', typeof sent.link?.url==='string' && sent.link.url.includes('/portal/'))
cd = await J(await api.get(`/api/bookings/${bookingId}/coordinator`))
const p2row=cd.travellers.find(t=>t.id===p2), p1row=cd.travellers.find(t=>t.id===p1)
R('coordinator shows P2 link with sentAt stamped', !!p2row.link?.sentAt)
R('P1 still has no link (send was per-traveller)', p1row.link===null)

const token = sent.link.url.split('/portal/')[1]
R('P2 link rejects name-only (no DOB)', (await api.post(`/api/portal/${token}/verify`, { data:{ answer:'Suzuki' } })).status()===403)
R('P2 link accepts Suzuki + right DOB', (await api.post(`/api/portal/${token}/verify`, { data:{ answer:'Suzuki', dob:'1985-11-20' } })).ok)
const html = await (await api.get(`/portal/${token}`)).text()
R('P2 link shows Suzuki not Tanaka', html.includes('Suzuki') && !html.includes('Tanaka'))
R('P2 token writing P1 (foreign) → 404', (await api.patch(`/api/portal/${token}/travellers/${p1}`, { data:{ first_name:'HACK' } })).status()===404)

await api.delete(`/api/bookings/${bookingId}/portal-link?passenger_id=${p2}`)
cd = await J(await api.get(`/api/bookings/${bookingId}/coordinator`))
R('after per-traveller revoke, P2 link gone in coordinator', cd.travellers.find(t=>t.id===p2).link===null)
R('revoked link no longer resolves (404)', (await api.get(`/portal/${token}`)).status()===404)

await svc.from('booking_portal_links').delete().eq('booking_id',bookingId)
await svc.from('booking_passengers').delete().eq('booking_id',bookingId)
await svc.from('bookings').delete().eq('id',bookingId)
const left=((await svc.from('bookings').select('id').ilike('booking_code','ZZ-%')).data||[]).length
console.log(`\ncleanup: ${left===0?'clean':'LEFTOVER '+left} | result: ${fails===0?'ALL PASS':fails+' FAILED'}`)
