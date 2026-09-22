# Departures Grid — design spec

**Status:** draft for operator sign-off (2026-09-22)
**Owner question still open:** confirm the grid shape below is what the office wants, and confirm the AIR/LND split rule (see §4).

---

## 1. What it is

One page per tour template that reproduces — and improves on — the Excel departure sheet the office prices by hand today. Departure **date bands down the side**, four money columns across:

| Column | JP | Meaning | Source |
|---|---|---|---|
| **AIR** | 航空 | Round-trip air, per person | flight legs priced through the engine |
| **燃油** | 燃油 | Fuel surcharge, per person, one number | **manual input** (computed outside the system) |
| **LND** | ランド | Land total, per person | everything else the engine prices |
| **合計** | 合計 | Gross = web rate, per person | AIR + 燃油 + LND |

All figures **per person, gross, in JPY**. Nine-ish bands is the norm but the count is data-driven (one row per departure or per band).

### The accuracy win — the reason to build it
The hand sheet uses **one flat LND across every date band**. The engine already knows hotel/cruise rate periods *and* ticket seasons (flights, trains, sleepers), so it can price **each departure at its own date** — `calculateAutoPricing` takes `travelDate` and picks the right period. So a July departure and a January departure that the sheet prints at the same LND come out correctly different. That is the pitch to the operator: same layout they know, but every band priced for real instead of copied down.

---

## 2. Data model — reuse, don't invent

`tour_departures` already exists and already has what we need:
- `template_id`, `start_date`, `end_date`, `duration_days`
- `price_per_person numeric`, `currency` (default EUR — grid overrides to JPY)
- `org_id`, `tour_name`, `tour_code`, `status`
- UNIQUE `(org_id, template_id, start_date)` — one row per departure date, safe to upsert on.

**Additions needed** (one migration):
- `fuel_surcharge_pp numeric(10,2)` — the manual 燃油 number, per person, in `currency`. Nullable; null = not yet entered.
- `flight_class varchar` (or reuse `internal_notes` for now) — operator wants the booked flight class recorded per departure. Confirm whether one class per departure or per leg.
- Optional cache columns so the grid loads without re-pricing every time:
  `air_pp numeric`, `land_pp numeric`, `priced_at timestamptz`, `price_currency varchar(3)`.
  These are a **cache of the last engine run**, never the source of truth — a "Reprice" action refreshes them. (Mirrors how the calculator page treats a saved quote.)

No new table. Bands = rows of `tour_departures` filtered by `template_id`, ordered by `start_date`.

---

## 3. Pricing path — one engine, per date

For each departure row the grid calls the existing engine, once per date:

```
calculateAutoPricing({
  templateId,
  tier,                 // the tour's sell tier
  isEurPassport,        // ATS = false (JP passports)
  travelDate: start_date,
  orgId,                // ATS Japan — REQUIRED for season premium
  rateCurrency: 'USD',  // ATS org rate_currency; DO NOT omit → defaults to EUR
  marginPercent: 30,    // markup on cost
  language, guideGrade, guideMode, numPax,
})
```

Then split the priced lines into the two buckets (§4), convert to JPY at the **office rate 160 JPY/USD** (internal, not the 157.15 live rate on file — confirm this is still the number to hard-use vs. a settable field), add the manual 燃油, and render 合計.

**Probe/So-it-works-in-code notes (from prior debugging, keep):**
- Never omit `rateCurrency` — without it the engine normalises to EUR.
- Guide/vehicle lines are `isPerPax:false`; their `lineTotal` is the **group** cost. For per-person figures use the result's `pricePerPerson`, don't sum lines by hand.
- `orgId` is what unlocks the season demand premium; the engine is otherwise org-blind.

---

## 4. AIR vs LND split — the rule to confirm

`flight_rates.flight_type` distinguishes `'domestic'` from international, and lines carry `serviceType`/`transport_type: 'flight'`. Proposed rule:

- **AIR (航空)** = all engine lines that are flights (`transport_type === 'flight'` / the flight ticket legs), **including domestic air**.
- **LND (ランド)** = every other priced line (hotels, cruise, guide, entrance, tips, water, ground transfers, meals).
- **燃油** = never from the engine; the manual per-person number.

> **Open point the operator must settle:** they corrected earlier that *"LND excludes domestic air."* This spec reads that as *domestic air belongs in AIR, not LND*. Confirm that reading. If instead domestic air is a third thing (neither AIR nor LND on the sheet), we need a rule for where it lands.

Keep the split in one pure helper (`lib/pricing/departure-buckets.ts`) so the grid and any export share it — same discipline as `breakdown-order.ts`.

---

## 5. UI

New page **`/departures/grid/[templateId]`** (the flat list at `/departures` stays as-is).

- Header: template name/code, tier, pax basis, FX rate used, margin.
- Table: one row per departure. Columns: date band | class | AIR | 燃油 (editable cell) | LND | 合計. 燃油 is inline-editable and autosaves to `fuel_surcharge_pp`; every other cell is engine-priced and read-only.
- Row actions: **Reprice** (re-run engine for that date, refresh cache), open the full calculator for that date to see the line-by-line breakdown.
- Toolbar: **Reprice all**, **Add band** (creates a `tour_departures` row), **Export** (XLSX matching the office sheet layout), FX-rate display.
- A row shows an **incomplete** badge when the engine reports `holes` (unpriced lines) for that date — so a flat-looking total isn't mistaken for a real one. (NEK803 today has known rate holes; the grid must surface them, not hide them.)

---

## 6. API

- `GET /api/departures/grid?template_id=…` → rows + per-row `{ air_pp, fuel_pp, land_pp, total_pp, currency, incomplete, holes }`. Serves cache; a `?reprice=1` forces a fresh engine run and writes the cache.
- `PATCH /api/departures/[id]` → already exists; extend to accept `fuel_surcharge_pp` and `flight_class`.
- Export reuses the same computed rows.

---

## 7. Build order

1. Migration: `fuel_surcharge_pp`, `flight_class`, cache columns (+ apply to prod **and** E2E).
2. `lib/pricing/departure-buckets.ts` — pure AIR/LND split + JPY conversion + 燃油 add. Unit-tested.
3. `GET /api/departures/grid` — fan out over dates, call engine per date, split, cache.
4. `/departures/grid/[templateId]` page — table, editable 燃油, Reprice, incomplete badges.
5. XLSX export mirroring the office sheet.
6. Wire "Grid" link from the departures list and the template editor.

## 8. Explicitly out of scope (for now)
- Changing how 燃油 is computed — stays a manual number.
- Booking/inventory (`booked_pax`, capacity) — the grid is a pricing view, not a reservations view.
- The number-reconciliation against the old Excel (abandoned — rates are dummy).

## 9. Prerequisites / risks
- Rate holes on real templates (e.g. NEK803 Aswan airport transfer, Aswan→Abu Simbel leg) will show as incomplete rows until the rate data is filled — that's correct behaviour, not a grid bug.
- Confirm 160 vs 157.15 JPY/USD and whether FX should be a settable field.
- Confirm flight class is per-departure or per-leg.
