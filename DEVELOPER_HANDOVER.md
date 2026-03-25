# Developer Handover Report — Pricing Grid Module

**Date:** 2026-03-25
**Module:** `/pricing-grid` (standalone pricing calculator)
**Status:** Partially working — core structure complete, auto-fill logic needs rework

---

## 1. Architecture Overview

The pricing grid is a standalone page at `/pricing-grid` that replaces the old AI-driven service creation engine (`lib/ai/service-creation.ts`, 1,900+ lines). It uses a fixed-slot grid approach where each day has two buckets:

- **GROUP SERVICES** (charged once, divided by pax): Vehicle, Route, Guide, Airport Services, Hotel Services, Tipping, Boat Rides, Other
- **PER-PERSON SERVICES** (multiplied by pax): Accommodation, Entrance Fees, Flights, Experiences, Meals, Water, Nile Cruise, Other

### File Map

```
app/pricing-grid/
├── page.tsx                    # Main page — header controls + day list + summary
├── types.ts                    # GridConfig, DayGridState, SlotDefinition, RateOption interfaces
├── lib/
│   └── calculator.ts           # Pure calculation functions (no business logic)
└── components/
    ├── GridHeader.tsx           # Pax, passport, tier, B2B/B2C, guide toggle, currency, margin, start date
    ├── DayRow.tsx               # Expandable day with two-bucket grid + option filtering
    ├── SlotRow.tsx              # Single service row (dropdown/multi-select/number input)
    ├── GridSummary.tsx          # Grand totals at bottom
    └── InputPanel.tsx           # Text paste area for AI parsing

app/api/pricing-grid/
├── rates/route.ts              # GET — fetches all rate options from Supabase, grouped by slot
├── parse/route.ts              # POST — AI parses pasted text into days, then post-processes with auto-fill
└── save/route.ts               # POST — saves completed grid (stub, not fully implemented)
```

### Data Flow

```
User pastes text → POST /api/pricing-grid/parse
  1. buildRateCatalog() fetches all rates from Supabase
  2. Builds concise catalog strings for AI prompt
  3. AI (Claude) parses text into days with slot IDs from catalog
  4. Post-processing: validates IDs, auto-fills missing slots
  5. enrichSlots() maps IDs to display names + rates
  6. Returns enriched days to frontend

Frontend loads rate options → GET /api/pricing-grid/rates?tier=standard
  - Returns all rates grouped by slot for dropdown population
  - DayRow.tsx filters options by day city/context before displaying
```

---

## 2. Known Bugs (Unresolved)

### Bug 1: Auto-fill Not Working Reliably

**Location:** `app/api/pricing-grid/parse/route.ts`, lines 340-540 (post-processing block)

**Symptoms:**
- Guide, meals, tipping sometimes not auto-filled on touring days
- Arrival day incorrectly gets guide/meals (false sightseeing detection)
- Route/transfers rarely auto-filled beyond Day 1

**Root Causes:**

1. **Sightseeing detection is fragile** (line ~336):
   ```typescript
   const hasSightseeing = !isArrivalDay && !isDepartureDay && (
     (slots.entrance_fees?.length > 0) ||
     /visit|tour|explore|sightsee|temple|pyramid|museum.../i.test(day.title || '')
   )
   ```
   - Only checks `day.title` now (was checking description which matched hotel names)
   - If AI sets a generic title like "Day 2", sightseeing won't be detected
   - Does not account for free/leisure days vs touring days

2. **City detection for cruise days is wrong**: AI often sets `city: "Cruise"` or `city: "Nile Cruise"` for sailing days instead of the actual port city (Aswan, Luxor, etc.). This causes meal auto-fill to fail: `No meals found for city "Cruise"`.

3. **Meal auto-fill uses exact city match** (line ~469):
   ```typescript
   const cityMeals = rawRates.mealRates?.filter((m: any) =>
     m.city?.toLowerCase() === cityLower
   )
   ```
   If city is "Cruise" or slightly different from DB entries (e.g., "El Gouna" vs "El-Gouna"), no meals are found.

4. **Route auto-fill** (lines ~386-460) tries to match origin/destination cities from `transportation_rates`, but the AI often doesn't set `overnight_city` on days, and the city-matching between parsed day cities and DB entries is fragile.

### Bug 2: Option Filtering Still Shows Irrelevant Items

**Location:** `app/pricing-grid/components/DayRow.tsx`, `getFilteredOptions()` (lines 33-140)

**What works:**
- Airport services filter by city airport code ✓
- Entrance fees filter by city ✓
- Accommodation filter by city ✓
- Hotel services filter by tier ✓

**What doesn't work well:**
- **Tipping**: Logic at lines 100-125 tries to contextually filter (driver-day for touring, guide only when guide active), but the `day.slots?.guide?.length` check reads from the initial AI parse, not the post-processed auto-filled state. So if auto-fill added a guide, the tipping filter doesn't know.
- **Meals on cruise days**: Filter returns `[]` for cruise days (correct), but the AI might still set city="Cruise" on non-cruise days that follow a cruise, causing empty meals.
- **Search fallback**: When user searches in SlotRow, it searches `allOptions` (unfiltered) — this is correct behavior but may confuse users who see different items in search vs default view.

### Bug 3: Nile Cruise Table Name Was Wrong

**Status:** FIXED in commit `e42ceb5`

The table is `nile_cruises`, not `cruise_rates`. Both `parse/route.ts` and `rates/route.ts` were updated. Column names also differ from what was originally coded:
- `nights` → `duration_nights`
- `route` → `route_name`
- `rate_double_eur` → `rate_double_eur` (legacy) or `rate_low_double_eur` (seasonal)

The cruise pricing system uses seasonal rates: `rate_{season}_{cabin}_{currency}` where season is `low/high/peak` and cabin is `single/double/triple/suite`. The `detectCruiseSeason()` function in `lib/ai/cruise-pricing.ts` handles this.

### Bug 4: Hotel Services Calculated Per-Person Instead of Per-Group

**Location:** `app/pricing-grid/types.ts` — SlotDefinition for hotel_services

Hotel services (porterage, check-in/out) should be in GROUP SERVICES bucket (charged once per group). In the current grid they ARE in the group bucket, but the rates from `hotel_staff_rates` show values like €15/€20/€25/€30 per tier. When 2 hotel services are selected (check-in + check-out), the total doubles. This is correct behavior — the issue the user saw (€40 for 2 selections) was actually 2 services × €20 each.

**However:** The DB stores flat per-group rates. When displaying in the grid, the `hotel_staff_rates` rows all show `service_type: "full_service"` with no descriptive name — just "full_service" repeated 4 times at different prices. Needs better display names.

### Bug 5: Cruise Transport Package Not Linked

**Location:** `app/api/pricing-grid/rates/route.ts` fetches `b2b_transport_packages` (line 38) and maps them into the `route` options (lines 62-76). But the parse endpoint does NOT reference these packages at all.

The cruise transport package (`b2b_transport_packages` table) bundles vehicle + guide + boat rides for cruise days. In the old pricing engine, this was handled by `lib/ai/cruise-pricing.ts`. In the grid, this should either:
- Auto-fill vehicle/guide/boat_rides slots on cruise-adjacent days from the package
- OR add a separate "Cruise Transport Package" slot

Currently neither is implemented.

---

## 3. Database Tables Used

| Table | Used For | Key Columns |
|-------|----------|-------------|
| `transportation_rates` | Vehicle + Route slots | `service_type` (day_tour/intercity_transfer/airport_transfer), `origin_city`, `destination_city`, `vehicle_type`, `capacity_min/max`, `base_rate_eur` |
| `guide_rates` | Guide slot | `guide_language`, `guide_type`, `city`, `base_rate_eur`, `rate_eur` |
| `airport_staff_rates` | Airport Services slot | `airport_code`, `direction` (arrival/departure/both), `rate_eur` |
| `hotel_staff_rates` | Hotel Services slot | `service_type`, `hotel_category` (budget/standard/deluxe/luxury/all), `destination`, `rate_eur` |
| `tipping_rates` | Tipping slot | `service_code` (e.g., TIP-DRIVER-DAY), `role`, `rate_eur` |
| `activity_rates` | Boat Rides + Experiences slots | `activity_name`, `city`, `category` (boat/experience), `rate_eur`, `pricing_type` |
| `accommodation_rates` | Accommodation slot | `property_name`, `city`, `tier`, `board_basis` (BB/HB/FB/AI), `pp_double_eur`, `single_supp_eur` |
| `entrance_fees` | Entrance Fees slot | `attraction_name`, `city`, `eur_rate`, `non_eur_rate` |
| `meal_rates` | Meals slot | `restaurant_name`, `meal_type` (lunch/dinner), `city`, `rate_eur`, `tier` |
| `nile_cruises` | Cruise slot | `ship_name`, `route_name`, `duration_nights`, `cabin_type`, `tier`, `rate_{season}_{cabin}_{currency}` |
| `b2b_transport_packages` | Cruise transport | `package_name`, `cruise_name`, `is_active` — bundles vehicle + guide + boat for cruise days |

---

## 4. What Works

1. **Grid UI structure** — days expand/collapse, two-bucket layout, slot rows render correctly
2. **Header controls** — pax, passport, tier, B2B/B2C, guide toggle, currency, margin all work and trigger recalculation
3. **Calculator** — pure functions in `calculator.ts` correctly compute group/pp totals, day totals, grand totals
4. **Rate fetching** — `GET /api/pricing-grid/rates` correctly loads all rate tables with `select('*')`
5. **Manual editing** — user can select/deselect items in any slot and totals recalculate instantly
6. **City-based filtering** — entrance fees, meals, accommodation correctly filter by day's city
7. **Tier filtering** — accommodation and hotel services filter by selected tier
8. **Nile cruise** — now loads from correct `nile_cruises` table and appears in dropdown
9. **Start date field** — added to header for seasonality

---

## 5. What Needs Work

### Priority 1: Fix Auto-Fill Logic in Parse Endpoint

The post-processing in `parse/route.ts` (lines 340-540) needs a complete rewrite with a cleaner approach:

**Recommended approach:**
1. Don't rely on regex for day type detection. Instead, have the AI explicitly return `dayType` in its output: `"arrival"`, `"departure"`, `"touring"`, `"cruise_embarkation"`, `"cruise_sailing"`, `"cruise_disembarkation"`, `"free_day"`, `"transfer_only"`.
2. Use the `dayType` to drive all auto-fill logic with a simple switch/case — no regex.
3. For each day type, define exactly which slots get auto-filled and which stay empty.

**Example:**
```typescript
switch (day.dayType) {
  case 'arrival':
    autoFill('vehicle', findAirportTransfer(day.city))
    autoFill('airport_services', findAirportService(day.city, 'arrival'))
    autoFill('hotel_services', findHotelService(tier))
    autoFill('tipping', [findTip('driver-half')])
    autoFill('accommodation', findHotel(day.city, tier))
    break
  case 'touring':
    autoFill('vehicle', findDayTourVehicle(day.city, pax))
    autoFill('guide', findGuide(language))
    autoFill('hotel_services', findHotelService(tier))
    autoFill('tipping', [findTip('driver-day'), findTip('guide-day')])
    autoFill('accommodation', findHotel(day.overnightCity, tier))
    autoFill('meals', [findMeal(day.city, 'lunch'), findMeal(day.city, 'dinner')])
    break
  // ... etc
}
```

### Priority 2: Fix Option Filtering in DayRow

The `getFilteredOptions()` function in `DayRow.tsx` needs to read from the **current slot state** (after auto-fill), not just the initial AI parse. For example, tipping should check if a guide is currently selected in the guide slot.

### Priority 3: Cruise Transport Package Integration

The `b2b_transport_packages` table contains bundled pricing for cruise-adjacent days. This needs to be:
1. Fetched in the parse endpoint (already fetched in rates endpoint)
2. Auto-applied on cruise embarkation/disembarkation days
3. When active, it should override individual vehicle/guide/boat_rides selections

### Priority 4: Better Display Names

- Hotel services show "full_service" × 4 with different prices — need to show tier name: "Full Service (standard) — €20"
- Tipping shows service_codes like "TIP-DRIVER-DAY" — need human-readable names: "Driver Tip (Full Day) — €10"
- Airport services show "CAI — both (CAI)" — redundant, should be "Cairo Airport (CAI) — €30"

### Priority 5: Seasonal Cruise Pricing

The grid currently uses `rate_double_eur` (legacy) or `rate_low_double_eur` (low season fallback). It should:
1. Use the start date from the header to detect season via `detectCruiseSeason()` from `lib/ai/cruise-pricing.ts`
2. Pick the correct seasonal rate column
3. Recalculate when start date changes

---

## 6. Commits Made During This Session

| Commit | Description |
|--------|-------------|
| `e92dd7d` | Cruise embarkation/disembarkation fixes + deluxe category + destination field |
| `925f82e` | 402 billing error handler |
| `1d354aa` | Initial pricing grid: page, components, API routes, AI parser |
| `e19f704` | City filtering, cruise packages, display names |
| `aa0937e` | Start date field for seasonality |
| `95953ce` | Tipping/hotel service display filtering |
| `4b9ad97` | Diagnostic logging + auto-fill fallbacks |
| `a652374` | Log Supabase errors to diagnose empty tables |
| `b5a84e7` | Root fix: `select('*')` instead of specific columns (was causing 0 rows for 4 tables) |
| `e42ceb5` | Fix cruise table: `nile_cruises` not `cruise_rates` + column names |
| `a7cd2fa` | Route auto-fill for airport/intercity transfers |
| `4c5e559` | Strict slot filtering by day context |
| `0258d6f` | Fix arrival day false sightseeing detection |

---

## 7. The Other App (Tour Calculator)

The user has a separate lighter app at `github.com/desertcanvasart-dotcom/tourcalculator` that uses a similar grid approach but with a simpler Excel-like layout (one row per service). Its parser is more reliable because it uses a strict row-based structure where each service maps to a fixed position. Consider studying its parsing approach for a more robust implementation.

---

## 8. Environment

- **Framework:** Next.js 16.0.10
- **Deployment:** Railway (auto-deploys from GitHub `main` branch)
- **Database:** Supabase (PostgreSQL)
- **AI:** Anthropic Claude API (via `lib/ai/anthropic-client.ts`)
- **Styling:** Tailwind CSS
- **i18n:** next-intl (EN + JA)
