// The demand-season windows that cover a departure, for one org
// (pricing_season_dates joined to its active season). The arithmetic on them
// is lib/pricing/season-uplift.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeasonWindow } from './season-uplift'

export async function seasonWindowsOn(
  supabase: SupabaseClient,
  orgId: string | null | undefined,
  travelDate: string | null | undefined
): Promise<SeasonWindow[]> {
  if (!orgId || !travelDate) return []
  const on = travelDate.slice(0, 10)

  const { data, error } = await supabase
    .from('pricing_season_dates')
    .select('season_id, start_date, end_date, pricing_seasons!inner(name, uplift_percent, is_active)')
    .eq('org_id', orgId)
    .lte('start_date', on)
    .gte('end_date', on)
    .eq('pricing_seasons.is_active', true)

  if (error || !data) return []

  return data.map(row => {
    const season = row.pricing_seasons as unknown as { name: string; uplift_percent: number }
    return {
      seasonId: String(row.season_id),
      name: String(season?.name ?? ''),
      upliftPercent: Number(season?.uplift_percent) || 0,
      startDate: String(row.start_date),
      endDate: String(row.end_date),
    }
  })
}
