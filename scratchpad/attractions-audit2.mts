import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,'')]}))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data: tpls, error } = await sb.from('tour_templates').select("id,template_code,template_name,tour_type,duration_days,itinerary").order("template_code")
if (error) console.log('ERR', error)
console.log('templates', tpls?.length)
const seen = new Map<string, number>()
for (const t of tpls ?? []) {
  const days = Array.isArray(t.itinerary) ? t.itinerary : []
  const attrs = days.flatMap((d: any) => Array.isArray(d.attractions) ? d.attractions : [])
  const titles = days.map((d:any)=>d.title).filter(Boolean).length
  console.log(`  ${t.template_code} ${t.template_name} | ${t.tour_type} ${t.duration_days}d days=${days.length} attrs=${attrs.length} titled=${titles} keys=${days[0]?Object.keys(days[0]).join(','):''}`)
  for (const a of attrs) seen.set(String(a), (seen.get(String(a)) ?? 0) + 1)
}
console.log('distinct attraction strings', seen.size)
for (const [k, v] of [...seen.entries()].sort((a,b)=>b[1]-a[1])) console.log('  ', v, JSON.stringify(k))
