import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')]}))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data: fees } = await sb.from('entrance_fees').select('id,attraction_name,city,eur_rate,non_eur_rate,is_active').order('attraction_name')
console.log('entrance_fees', fees?.length)
for (const f of fees ?? []) console.log('  ', f.attraction_name, '|', f.city, '|', f.eur_rate, '/', f.non_eur_rate, f.is_active===false?'INACTIVE':'')
const { data: al } = await sb.from('attraction_aliases').select('canonical_name,alias,source_table,is_active').order('canonical_name')
console.log('aliases', al?.length)
for (const a of al ?? []) console.log('  ', a.canonical_name, '<=', a.alias, '|', a.source_table)
const { data: tpls } = await sb.from('tour_templates').select('id,code,name,itinerary').order('code')
console.log('templates', tpls?.length)
const seen = new Map<string, number>()
for (const t of tpls ?? []) {
  const days = Array.isArray(t.itinerary) ? t.itinerary : []
  const attrs = days.flatMap((d: any) => Array.isArray(d.attractions) ? d.attractions : [])
  console.log(`  ${t.code ?? '-'} ${t.name} days=${days.length} attrs=${attrs.length}`)
  for (const a of attrs) seen.set(String(a), (seen.get(String(a)) ?? 0) + 1)
}
console.log('distinct attraction strings', seen.size)
for (const [k, v] of [...seen.entries()].sort((a,b)=>b[1]-a[1])) console.log('  ', v, k)
