import { SLEEPING_TRAIN_CABIN_VALUES } from '@/lib/rates/sleeping-train-cabins'
/**
 * Bulk Rate Import/Export Service
 * Provides CSV import/export for all rate tables with validation and upsert.
 */

// ============================================
// TYPES
// ============================================

export interface RateTableConfig {
  tableName: string
  displayName: string
  columns: ColumnDef[]
  uniqueKey: string[]       // columns used for upsert matching
}

export interface ColumnDef {
  name: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'date'
  required: boolean
  exportOnly?: boolean         // e.g., id, created_at — included in export but not required for import
  allowedValues?: readonly string[]  // when set, the cell must match (case-insensitive)
}

export interface ValidationError {
  row: number
  column: string
  message: string
}

export interface ImportResult {
  totalRows: number
  validRows: number
  invalidRows: number
  inserted: number
  updated: number
  errors: ValidationError[]
  /** Things that did not fail, but that the operator would want to know. */
  warnings?: ImportWarning[]
}

export interface ImportWarning {
  /** `example_row_skipped`: the unedited sample row from a downloaded
   *  template was left out rather than inserted as a rate. */
  kind: 'example_row_skipped'
  key: string
  message: string
}

export interface ImportPreview {
  totalRows: number
  validRows: number
  invalidRows: number
  errors: ValidationError[]
  sampleData: Record<string, any>[]  // first 5 rows
  // L7: the FULL set of parsed valid rows. The import route reuses these
  // for the actual upsert so validation and persistence share one parser,
  // and a row that passes validation cannot land as a subtly-different
  // record at write time. Not serialized in the dry-run response — only
  // exposed to in-process callers.
  parsedValidRows?: Record<string, any>[]
}

// ============================================
// COLUMN HELPERS
// ============================================

function col(name: string, label: string, type: ColumnDef['type'], required: boolean, exportOnly = false): ColumnDef {
  return { name, label, type, required, exportOnly }
}

// Helper for an enum-constrained text column. Values are normalized to the
// configured spelling on import, so a stray "Day_Tour" becomes "day_tour".
function colEnum(name: string, label: string, allowedValues: readonly string[], required: boolean): ColumnDef {
  return { name, label, type: 'text', required, allowedValues }
}

// Canonical transportation service_type taxonomy (locked-in 2026-06-23).
// See ~/.claude/.../memory/transportation-types.md for the full spec.
const TRANSPORTATION_SERVICE_TYPES = [
  'airport_transfer',
  'airport_with_sightseeing',
  'city_transfer',
  'city_tour',
  'intercity',
  'intercity_with_sightseeing',
  'half_day',
  'day_tour',
  'extended_day_tour',
  'sound_light',
  'dinner_transfer',
] as const

function id(): ColumnDef { return col('id', 'ID', 'text', false, true) }
function serviceCode(): ColumnDef { return col('service_code', 'Service Code', 'text', false) }
function isActive(): ColumnDef { return col('is_active', 'Active', 'boolean', false) }
function notes(): ColumnDef { return col('notes', 'Notes', 'text', false) }
function createdAt(): ColumnDef { return col('created_at', 'Created At', 'date', false, true) }
function updatedAt(): ColumnDef { return col('updated_at', 'Updated At', 'date', false, true) }
function rateValidFrom(): ColumnDef { return col('rate_valid_from', 'Rate Valid From', 'date', false) }
function rateValidTo(): ColumnDef { return col('rate_valid_to', 'Rate Valid To', 'date', false) }
function supplierId(): ColumnDef { return col('supplier_id', 'Supplier ID', 'text', false) }
function season(): ColumnDef { return col('season', 'Season', 'text', false) }

// ============================================
// TABLE CONFIGS (14 tables)
// ============================================

export const RATE_TABLE_CONFIGS: Record<string, RateTableConfig> = {
  accommodation_rates: {
    tableName: 'accommodation_rates',
    displayName: 'Hotels / Accommodation',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('property_name', 'Property Name', 'text', true),
      col('property_type', 'Property Type', 'text', false),
      col('city', 'City', 'text', false),
      col('board_basis', 'Board Basis', 'text', false),
      // No season rate columns: a hotel prices from its dated period list
      // (the `seasons` JSONB), imported from the rate-periods sheet. This
      // sheet carries the property and the contract around it, not the prices.
      // Validity
      rateValidFrom(), rateValidTo(),
      // Contact
      col('contact_name', 'Contact Name', 'text', false),
      col('contact_email', 'Contact Email', 'text', false),
      col('contact_phone', 'Contact Phone', 'text', false),
      col('reservations_email', 'Reservations Email', 'text', false),
      col('reservations_phone', 'Reservations Phone', 'text', false),
      isActive(), createdAt(), updatedAt(),
    ],
  },

  transportation_rates: {
    tableName: 'transportation_rates',
    displayName: 'Transportation',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      colEnum('service_type', 'Service Type', TRANSPORTATION_SERVICE_TYPES, true),
      col('city', 'City', 'text', true),
      col('origin_city', 'Origin City', 'text', false),
      col('destination_city', 'Destination City', 'text', false),
      col('route_name', 'Route Name', 'text', false),
      col('duration', 'Duration', 'text', false),
      col('area', 'Area', 'text', false),
      col('includes', 'Includes', 'text', false),
      // Vehicle rates
      col('sedan_rate_eur', 'Sedan (EU passport)', 'number', false),
      col('sedan_rate_non_eur', 'Sedan (non-EU passport)', 'number', false),
      col('sedan_capacity_min', 'Sedan Cap Min', 'number', false),
      col('sedan_capacity_max', 'Sedan Cap Max', 'number', false),
      col('minivan_rate_eur', 'Minivan (EU passport)', 'number', false),
      col('minivan_rate_non_eur', 'Minivan (non-EU passport)', 'number', false),
      col('minivan_capacity_min', 'Minivan Cap Min', 'number', false),
      col('minivan_capacity_max', 'Minivan Cap Max', 'number', false),
      col('van_rate_eur', 'Van (EU passport)', 'number', false),
      col('van_rate_non_eur', 'Van (non-EU passport)', 'number', false),
      col('van_capacity_min', 'Van Cap Min', 'number', false),
      col('van_capacity_max', 'Van Cap Max', 'number', false),
      col('minibus_rate_eur', 'Minibus (EU passport)', 'number', false),
      col('minibus_rate_non_eur', 'Minibus (non-EU passport)', 'number', false),
      col('minibus_capacity_min', 'Minibus Cap Min', 'number', false),
      col('minibus_capacity_max', 'Minibus Cap Max', 'number', false),
      col('bus_rate_eur', 'Bus (EU passport)', 'number', false),
      col('bus_rate_non_eur', 'Bus (non-EU passport)', 'number', false),
      col('bus_capacity_min', 'Bus Cap Min', 'number', false),
      col('bus_capacity_max', 'Bus Cap Max', 'number', false),
      season(), rateValidFrom(), rateValidTo(),
      supplierId(), notes(), isActive(), createdAt(), updatedAt(),
    ],
  },

  guide_rates: {
    tableName: 'guide_rates',
    displayName: 'Guide Rates',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('guide_language', 'Language', 'text', true),
      col('guide_type', 'Guide Type', 'text', true),
      col('city', 'City', 'text', false),
      col('tour_duration', 'Tour Duration', 'text', true),
      col('base_rate_eur', 'Rate (EU passport)', 'number', true),
      col('base_rate_non_eur', 'Rate (non-EU passport)', 'number', true),
      season(), rateValidFrom(), rateValidTo(),
      supplierId(), notes(), isActive(), createdAt(), updatedAt(),
    ],
  },

  meal_rates: {
    tableName: 'meal_rates',
    displayName: 'Meal Rates',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('restaurant_name', 'Restaurant Name', 'text', true),
      col('meal_type', 'Meal Type', 'text', false),
      col('cuisine_type', 'Cuisine Type', 'text', false),
      col('restaurant_type', 'Restaurant Type', 'text', false),
      col('city', 'City', 'text', false),
      col('base_rate_eur', 'Rate (EU passport)', 'number', true),
      col('base_rate_non_eur', 'Rate (non-EU passport)', 'number', true),
      col('tier', 'Tier', 'text', false),
      col('meal_category', 'Meal Category', 'text', false),
      col('per_person_rate', 'Per Person', 'boolean', false),
      col('minimum_pax', 'Min Pax', 'number', false),
      season(), rateValidFrom(), rateValidTo(),
      supplierId(),
      col('supplier_name', 'Supplier Name', 'text', false),
      notes(), isActive(),
      col('is_preferred', 'Preferred', 'boolean', false),
      createdAt(), updatedAt(),
    ],
  },

  entrance_fees: {
    tableName: 'entrance_fees',
    displayName: 'Attractions / Entrance Fees',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('attraction_name', 'Attraction Name', 'text', true),
      col('city', 'City', 'text', true),
      col('fee_type', 'Fee Type', 'text', false),
      col('eur_rate', 'Rate (EU passport)', 'number', true),
      col('non_eur_rate', 'Rate (non-EU passport)', 'number', true),
      col('egyptian_rate', 'Egyptian Rate', 'number', false),
      col('student_discount_percentage', 'Student Discount %', 'number', false),
      col('child_discount_percent', 'Child Discount %', 'number', false),
      col('category', 'Category', 'text', false),
      col('is_addon', 'Is Add-on', 'boolean', false),
      col('addon_note', 'Add-on Note', 'text', false),
      season(), rateValidFrom(), rateValidTo(),
      supplierId(), notes(), isActive(), createdAt(), updatedAt(),
    ],
  },

  flight_rates: {
    tableName: 'flight_rates',
    displayName: 'Flight Rates',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('route_from', 'From', 'text', true),
      col('route_to', 'To', 'text', true),
      col('airline', 'Airline', 'text', true),
      col('flight_number', 'Flight Number', 'text', false),
      col('flight_type', 'Flight Type', 'text', false),
      col('cabin_class', 'Cabin Class', 'text', false),
      col('base_rate_eur', 'Rate (EU passport)', 'number', true),
      col('base_rate_non_eur', 'Rate (non-EU passport)', 'number', true),
      col('baggage_kg', 'Baggage (kg)', 'number', false),
      col('departure_time', 'Departure Time', 'text', false),
      col('arrival_time', 'Arrival Time', 'text', false),
      col('duration_minutes', 'Duration (min)', 'number', false),
      col('frequency', 'Frequency', 'text', false),
      season(), rateValidFrom(), rateValidTo(),
      supplierId(),
      col('supplier_name', 'Supplier Name', 'text', false),
      notes(), isActive(), createdAt(), updatedAt(),
    ],
  },

  activity_rates: {
    tableName: 'activity_rates',
    displayName: 'Activity Rates',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('activity_name', 'Activity Name', 'text', true),
      col('activity_category', 'Category', 'text', false),
      col('activity_type', 'Activity Type', 'text', false),
      col('duration', 'Duration', 'text', false),
      col('city', 'City', 'text', false),
      col('base_rate_eur', 'Rate (EU passport)', 'number', true),
      col('base_rate_non_eur', 'Rate (non-EU passport)', 'number', true),
      col('pricing_type', 'Pricing Type', 'text', false),
      col('unit_label', 'Unit Label', 'text', false),
      col('min_capacity', 'Min Capacity', 'number', false),
      col('max_capacity', 'Max Capacity', 'number', false),
      season(), rateValidFrom(), rateValidTo(),
      supplierId(),
      col('supplier_name', 'Supplier Name', 'text', false),
      notes(), isActive(), createdAt(), updatedAt(),
    ],
  },

  tipping_rates: {
    tableName: 'tipping_rates',
    displayName: 'Tipping Rates',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('role_type', 'Role Type', 'text', true),
      col('context', 'Context', 'text', false),
      col('rate_unit', 'Rate Unit', 'text', true),
      col('rate_eur', 'Rate (EU passport)', 'number', true),
      col('description', 'Description', 'text', false),
      notes(), isActive(),
    ],
  },

  airport_staff_rates: {
    tableName: 'airport_staff_rates',
    displayName: 'Airport Service Rates',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('airport_code', 'Airport Code', 'text', true),
      col('service_type', 'Service Type', 'text', true),
      col('direction', 'Direction', 'text', true),
      col('rate_eur', 'Rate (EU passport)', 'number', true),
      col('description', 'Description', 'text', false),
      notes(), isActive(),
    ],
  },

  hotel_staff_rates: {
    tableName: 'hotel_staff_rates',
    displayName: 'Hotel Service Rates',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('service_type', 'Service Type', 'text', true),
      col('hotel_category', 'Hotel Category', 'text', true),
      col('rate_eur', 'Rate (EU passport)', 'number', true),
      col('description', 'Description', 'text', false),
      notes(), isActive(),
    ],
  },

  nile_cruises: {
    tableName: 'nile_cruises',
    displayName: 'Nile Cruises',
    uniqueKey: ['cruise_code'],
    columns: [
      id(),
      col('cruise_code', 'Cruise Code', 'text', true),
      col('ship_name', 'Ship Name', 'text', true),
      col('ship_category', 'Category', 'text', true),
      col('route_name', 'Route', 'text', true),
      col('embark_city', 'Embark City', 'text', true),
      col('disembark_city', 'Disembark City', 'text', true),
      col('duration_nights', 'Duration (Nights)', 'number', true),
      // No season rate columns: a cruise prices from its dated period list
      // (the `seasons` JSONB), imported from the rate-periods sheet. This
      // sheet carries the ship and the contract around it, not the prices.
      // Other
      rateValidFrom(), rateValidTo(),
      col('meals_included', 'Meals Included', 'text', false),
      col('sightseeing_included', 'Sightseeing Included', 'boolean', false),
      col('tier', 'Tier', 'text', false),
      col('is_preferred', 'Preferred', 'boolean', false),
      supplierId(),
      col('description', 'Description', 'text', false),
      notes(), isActive(),
      col('created_at', 'Created At', 'date', false, true),
    ],
  },

  train_rates: {
    tableName: 'train_rates',
    displayName: 'Train Rates',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('origin_city', 'Origin City', 'text', true),
      col('destination_city', 'Destination City', 'text', true),
      col('class_type', 'Class Type', 'text', true),
      col('rate_eur', 'Rate (EU passport)', 'number', true),
      col('duration_hours', 'Duration (hours)', 'number', false),
      col('operator_name', 'Operator', 'text', false),
      col('departure_times', 'Departure Times', 'text', false),
      rateValidFrom(), rateValidTo(),
      supplierId(),
      col('description', 'Description', 'text', false),
      notes(), isActive(), createdAt(), updatedAt(),
    ],
  },

  sleeping_train_rates: {
    tableName: 'sleeping_train_rates',
    displayName: 'Sleeping Train Rates',
    uniqueKey: ['service_code'],
    columns: [
      id(), serviceCode(),
      col('origin_city', 'Origin City', 'text', true),
      col('destination_city', 'Destination City', 'text', true),
      colEnum('cabin_type', 'Cabin Type', SLEEPING_TRAIN_CABIN_VALUES, true),
      col('rate_oneway_eur', 'One-Way (EU passport)', 'number', true),
      col('rate_roundtrip_eur', 'Roundtrip (EU passport)', 'number', false),
      col('departure_time', 'Departure Time', 'text', false),
      col('arrival_time', 'Arrival Time', 'text', false),
      season(), rateValidFrom(), rateValidTo(),
      col('operator_name', 'Operator', 'text', false),
      supplierId(),
      col('description', 'Description', 'text', false),
      notes(), isActive(), createdAt(), updatedAt(),
    ],
  },

  fixed_costs: {
    tableName: 'fixed_costs',
    displayName: 'Fixed Costs',
    uniqueKey: ['cost_type'],
    columns: [
      id(),
      col('cost_type', 'Cost Type', 'text', true),
      col('cost_per_person_per_day', 'Cost Per Person/Day', 'number', true),
      col('description', 'Description', 'text', false),
      isActive(), createdAt(), updatedAt(),
    ],
  },
}

// ============================================
// VALIDATION
// ============================================

/**
 * Parse a cell value based on the column type.
 */
function parseCell(value: string | undefined | null, colDef: ColumnDef): { parsed: any; error: string | null } {
  const raw = (value ?? '').trim()

  // Empty value
  if (raw === '' || raw === 'null' || raw === 'NULL') {
    if (colDef.required) {
      return { parsed: null, error: `${colDef.label} is required` }
    }
    return { parsed: null, error: null }
  }

  switch (colDef.type) {
    case 'number': {
      const num = Number(raw)
      if (isNaN(num)) {
        return { parsed: null, error: `${colDef.label} must be a number` }
      }
      return { parsed: num, error: null }
    }
    case 'boolean': {
      const lower = raw.toLowerCase()
      if (['true', '1', 'yes', 'y'].includes(lower)) return { parsed: true, error: null }
      if (['false', '0', 'no', 'n'].includes(lower)) return { parsed: false, error: null }
      return { parsed: null, error: `${colDef.label} must be true/false` }
    }
    case 'date': {
      // ISO YYYY-MM-DD or ISO timestamp — pass through
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        return { parsed: raw, error: null }
      }
      // DD/MM/YYYY (Excel/Numbers reformats ISO dates to the user's locale on
      // save — this caused a real prod import failure where the DB rejected
      // "23/06/2026" as an invalid date). Normalize to ISO for the DB.
      const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (dmy) {
        return { parsed: `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`, error: null }
      }
      return { parsed: raw, error: null } // Be lenient with other date formats
    }
    case 'text':
    default: {
      if (colDef.allowedValues && colDef.allowedValues.length > 0) {
        // Case-insensitive match; on hit, normalize to the canonical spelling
        // so downstream code never has to .toLowerCase() to look it up.
        const lower = raw.toLowerCase()
        const match = colDef.allowedValues.find(v => v.toLowerCase() === lower)
        if (!match) {
          return {
            parsed: null,
            error: `${colDef.label} must be one of: ${colDef.allowedValues.join(', ')} (got "${raw}")`,
          }
        }
        return { parsed: match, error: null }
      }
      return { parsed: raw, error: null }
    }
  }
}

/**
 * Validate parsed CSV data against a table config.
 * Returns an ImportPreview with validation results.
 */
export function validateImportData(
  rows: Record<string, string>[],
  config: RateTableConfig
): ImportPreview {
  const errors: ValidationError[] = []
  const validRows: Record<string, any>[] = []

  // Build a lookup of column defs by name
  const colMap = new Map<string, ColumnDef>()
  for (const c of config.columns) {
    colMap.set(c.name, c)
  }

  // Get importable columns (exclude export-only like id, created_at)
  const importableColumns = config.columns.filter(c => !c.exportOnly)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2 // +2 because row 1 is header, data starts at row 2
    const parsedRow: Record<string, any> = {}
    let rowValid = true

    for (const colDef of importableColumns) {
      const rawValue = row[colDef.name]
      const { parsed, error } = parseCell(rawValue, colDef)

      if (error) {
        errors.push({ row: rowNum, column: colDef.name, message: error })
        rowValid = false
      } else if (parsed !== null) {
        parsedRow[colDef.name] = parsed
      }
    }

    if (rowValid) {
      validRows.push(parsedRow)
    }
  }

  return {
    totalRows: rows.length,
    validRows: validRows.length,
    invalidRows: rows.length - validRows.length,
    errors: errors.slice(0, 100), // Cap at 100 errors
    sampleData: validRows.slice(0, 5),
    parsedValidRows: validRows, // L7: single source of truth for the import path
  }
}

/**
 * Generate CSV headers for a table config.
 */
export function getExportHeaders(config: RateTableConfig): string[] {
  return config.columns.map(c => c.name)
}

// ============================================
// A sample file to start from
// ============================================
// Exporting an EMPTY rate table produced a completely blank file — Papa
// returns "" for zero rows, headers and all — so the one moment somebody most
// needs to know the format (their first import, before any data exists) was
// the moment the system told them nothing.
//
// The template is the headers plus one filled-in example row, because headers
// alone still leave the date format and the enum spellings to guesswork.
//
// The example row carries EXAMPLE_ROW_KEY in the unique-key column and the
// importer SKIPS it, so the classic mistake — filling in the sheet underneath
// and importing the sample along with it — cannot land a junk rate.

export const EXAMPLE_ROW_KEY = 'EXAMPLE-DELETE-THIS-ROW'

/** Is this the untouched sample row from a downloaded template? */
export function isExampleRow(value: unknown): boolean {
  return String(value ?? '').trim().toUpperCase() === EXAMPLE_ROW_KEY
}

/** A coherent sample calendar. A template whose every date is the same day
 *  teaches nothing about which column is a start and which an end, and a
 *  season list where low, high and peak share a window is not a rate card
 *  anyone would recognise. */
const SAMPLE_DATES: Record<string, [string, string]> = {
  low:      ['2026-05-01', '2026-09-30'],
  high:     ['2026-10-01', '2026-12-19'],
  peak:     ['2026-12-20', '2027-01-05'],
  peak_2:   ['2027-03-20', '2027-03-28'],
  validity: ['2026-04-01', '2027-03-31'],
  other:    ['2026-05-01', '2026-09-30'],
}

/** Which pair of dates a column belongs to, and whether it is the start. */
function sampleDate(name: string): string {
  const isEnd = /(_to|_end)$/.test(name)
  const band =
    /peak_season_2|peak_2/.test(name) ? 'peak_2'
    : /peak/.test(name) ? 'peak'
    : /high/.test(name) ? 'high'
    : /valid/.test(name) ? 'validity'
    : /low/.test(name) ? 'low'
    : 'other'
  return SAMPLE_DATES[band][isEnd ? 1 : 0]
}

/** Sample money. A row where every number is 100 does not show which column is
 *  the headline rate and which is a supplement — and a rate card where peak
 *  costs the same as low is not one either. */
function sampleNumber(name: string): string {
  // Supplements and reductions are a fraction of the rate they attach to.
  const role =
    /supp/.test(name) ? 0.5
    : /(red|reduction|child|infant)/.test(name) ? 0.15
    : 1
  const season =
    /peak/.test(name) ? 1.8
    : /high/.test(name) ? 1.35
    : 1
  const base = /single/.test(name) && !/supp/.test(name) ? 140 : 100
  return String(Math.round(base * role * season))
}

/** Plausible sample values, so the row reads as a real rate rather than as
 *  filler. Matched on the column name first, then the declared type. */
function exampleValue(colDef: ColumnDef, config: RateTableConfig): string {
  // An enum tells us its own vocabulary; the first value is always valid.
  if (colDef.allowedValues?.length) return colDef.allowedValues[0]

  if (config.uniqueKey.includes(colDef.name)) return EXAMPLE_ROW_KEY

  const name = colDef.name
  if (/(^|_)(email)/.test(name)) return 'reservations@example-hotel.com'
  if (/(^|_)(phone|fax|mobile)/.test(name)) return '+20 100 000 0000'
  if (/(^|_)city$/.test(name) || name === 'embark_city' || name === 'disembark_city') return 'Cairo'
  if (/country/.test(name)) return 'Egypt'
  if (name === 'property_type') return 'hotel'
  if (name === 'board_basis') return 'BB'
  if (name === 'tier') return 'standard'
  if (/(property|ship|hotel|supplier|contact|attraction|activity|guide|route|template)_?name/.test(name)) {
    return 'Example Name'
  }
  if (/notes|description|remarks/.test(name)) return 'Optional free text'

  switch (colDef.type) {
    case 'date':
      // ISO. The importer also accepts DD/MM/YYYY because Excel rewrites dates
      // on save, but the sample should show the form that always works.
      return sampleDate(name)
    case 'number':
      // Never 0: a blank or zero rate means "unpriced" in this system, and a
      // sample that teaches otherwise is a sample that causes holes.
      return sampleNumber(name)
    case 'boolean':
      return 'true'
    default:
      return colDef.required ? 'Required' : ''
  }
}

/** Headers for a template: everything the importer reads, and nothing it
 *  ignores — id and the timestamps are export-only and would just be noise on
 *  a sheet somebody is filling in by hand. */
export function getTemplateHeaders(config: RateTableConfig): string[] {
  return config.columns.filter(c => !c.exportOnly).map(c => c.name)
}

/** The single example row, keyed by column name. */
export function buildTemplateRow(config: RateTableConfig): Record<string, string> {
  const row: Record<string, string> = {}
  for (const colDef of config.columns) {
    if (colDef.exportOnly) continue
    row[colDef.name] = exampleValue(colDef, config)
  }
  return row
}

/**
 * Get the display name for a table.
 */
export function getTableDisplayName(tableName: string): string {
  return RATE_TABLE_CONFIGS[tableName]?.displayName || tableName
}

/**
 * Get the list of all supported table names.
 */
export function getSupportedTables(): string[] {
  return Object.keys(RATE_TABLE_CONFIGS)
}
