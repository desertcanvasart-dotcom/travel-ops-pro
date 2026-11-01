// ============================================
// Which table each rate sheet lists
// ============================================
// The Rates menu's row counts (app/api/rates/summary) count the rows a sheet
// lists: the same table its own API reads (app/api/rates/<sheet>/route.ts),
// this company's rows, active and inactive alike — the sheets show both.
// __tests__/lib/rates-summary.test.ts holds each entry to the table its
// sheet's route reads, and to the sheets in lib/nav/config.ts RATE_GROUPS.
//
// Commission rates has no table of its own (it lists suppliers' commission
// terms), so it has no count: no number beats a misleading one.

export const SHEET_TABLES: Record<string, { table: string; api: string } | null> = {
  '/rates/hotels': { table: 'accommodation_rates', api: 'hotels' },
  '/rates/cruises': { table: 'nile_cruises', api: 'cruises' },
  '/rates/sleeping-train': { table: 'sleeping_train_rates', api: 'sleeping-trains' },
  '/rates/hotel-services': { table: 'hotel_staff_rates', api: 'hotel-services' },
  '/rates/transportation': { table: 'transportation_rates', api: 'transportation' },
  '/rates/flights': { table: 'flight_rates', api: 'flights' },
  '/rates/trains': { table: 'train_rates', api: 'trains' },
  '/rates/airport-services': { table: 'airport_staff_rates', api: 'airport-services' },
  '/rates/guides': { table: 'guide_rates', api: 'guides' },
  '/rates/meals': { table: 'meal_rates', api: 'meals' },
  '/rates/attractions': { table: 'entrance_fees', api: 'attractions' },
  '/rates/activities': { table: 'activity_rates', api: 'activities' },
  '/rates/tipping': { table: 'tipping_rates', api: 'tipping' },
  '/rates/fixed-costs': { table: 'fixed_daily_costs', api: 'fixed-costs' },
  '/rates/commissions': null,
}
