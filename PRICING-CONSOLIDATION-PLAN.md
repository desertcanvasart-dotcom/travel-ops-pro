# Pricing Consolidation Plan — one core, grid canonical (travel-ops-pro)

_Status: PROPOSED (awaiting approval). No code yet — this PR is the plan only._
_Companion to `PRICING-HARNESS-PLAN.md` (the harness that makes pricing definite). This plan removes the **redundancy** that keeps re-introducing the fabrication the harness fights, and makes the **pricing grid the single source of truth**._
_Ported from the sibling app (autoura-saas) and adapted. The hard truth up front: this repo has **more** parallel calculators and the grid is **more isolated** here than in the sibling, so the consolidation is bigger._

---

## 0. The decision this plan encodes

1. **The pricing grid is the canonical pricing surface.** It already exists (`app/pricing-grid/`, `lib/calculator.ts`, `lib/slot-mapping.ts`) and is architecturally the cleanest engine.
2. **"No duplication" means one place where a rate becomes money, with no fabrication** — not literally one screen.
3. **The downstream pipeline stays untouched** (itinerary, `itinerary_services`, quotes, invoices, PDFs, send). We consolidate the *source of the numbers*, not the pipeline.
4. **Honest end-state: "one rate-resolution + completeness CORE, grid as the canonical bespoke surface, the fabricator route gone, the AI/quote flow routed through the core."** A full collapse to literally one calculator is **not** achievable without rebuilding the B2B multi-pax + template-caching flows — the same trade-off the sibling hit. Treat full collapse as an optional later phase.

---

## 1. Current state (verified against the code, 2026-06-21)

### There are 5+ distinct calculators reading overlapping rate tables
| # | Calculator | Entry points | Reads | Persists |
|---|---|---|---|---|
| 1 | **Pricing grid** (canonical target) | `app/pricing-grid/` + `/api/pricing-grid/{rates,parse,save}` | all rate tables, via `/rates` | `itineraries` · `itinerary_days` · `itinerary_services` |
| 2 | `lib/auto-pricing-service.ts` (`calculateAutoPricing`) | `/api/tours/templates/[id]/auto-price` · `/api/tours/recalculate-prices` · `/api/b2b/calculate-price` | all rate tables | `tour_templates.cached_starting_price` · `b2b_quotes` |
| 3 | `lib/rate-lookup-service.ts` (`calculatePricingFromRates` + `getFallbackRates`) | `/api/ai/build-quote` | rate tables + **invented fallbacks** | via build-quote |
| 4 | `lib/tourCalculator.ts` (`calculateTourPricing`) | `/api/tours/calculate` | **none** — in-memory Tour object | none |
| 5 | `app/api/pricing/calculate/route.ts` | manual API (day-tour) | transport/guide/tipping/meal + `profit_margins`, `fixed_daily_costs`, … | none |

Plus the fabricating **`app/api/itineraries/[id]/calculate-pricing/route.ts`** (an itinerary "recalculate" route — the same kind the sibling deleted in its Phase C).

> Confirm during implementation (agents could only infer): exactly how `itineraries/[id]/calculate-pricing` persists, and whether the grid currently feeds the quote/AI pipeline at all (it appears **not** to — quotes price via #2/#3).

### The core problem vs. the sibling
In the sibling, the grid was already wired into the pipeline; here it appears **isolated** — it saves itineraries, but the quote / AI / B2B flows price through `auto-pricing-service` and `rate-lookup-service` instead. So "make the grid the source of truth" requires **routing those flows through the shared core**, not just deleting one route.

### Rate-resolution is duplicated 3–4× and fabricates
Grid `/rates`, `auto-pricing-service` lookups, `rate-lookup-service` (with `getFallbackRates`), and `pricing/calculate` each have their own "look up a rate." This divergence is the root cause of the silent-default bug class.

---

## 2. Target architecture

```
 INTAKE: paste · file/vision · load-by-id · WhatsApp/email
                              │
             ┌────────────────┴─────────────────┐
   BESPOKE SURFACE (canonical)            RATE-SHEET SURFACE (B2B, kept)
   pricing-grid calculator               auto-pricing-service (variation × pax)
             └────────────────┬─────────────────┘
                              │
       ONE RATE-RESOLUTION + COMPLETENESS CORE
   lib/pricing/rate-resolution.ts  → real rate + provenance, or a HOLE — never a default
                              │
   EXISTING PIPELINE (kept): itinerary · itinerary_services · quotes · invoices · PDFs · send
```

---

## 3. Migration sequence (redirect-before-delete; each phase behind tests + CI)

> Prerequisite: **the harness (`PRICING-HARNESS-PLAN.md`) lands first.** Consolidation builds on `lib/pricing-types.ts` + `lib/pricing-guards.ts` + the de-fabricated engine.

### Phase A — Extract the shared rate-resolution core _(no behavior change)_
- New `lib/pricing/rate-resolution.ts` (port the sibling's facade): single canonical import surface re-exporting the hardened lookups from `auto-pricing-service.ts`. Test proves same refs, no fork.
- **Acceptance:** all tests green; no `|| <number>` rate fallback in the surfaced code.

### Phase B — Grid completeness gate _(fixes the canonical surface's gap)_
- Port `grid-completeness.ts`: per-day components drive required slots (sleep on overnight, type-aware transport, class-aware entrances, guide when sightseeing, …). Surface a "needs attention" panel; gate `pricing-grid/save` + quote-create; tie into the Phase-2 send gate.
- **Acceptance:** an incomplete grid can't silently become a deliverable quote and lists exactly what's missing.

### Phase C — Kill the itinerary fabricator
- Re-point `app/itineraries/[id]/edit` "Recalculate" → navigate to the grid (`/pricing-grid?itinerary=<id>`); itinerary `GET` supports `?include=days`; grid loads + restores grid-priced slots.
- **Delete** `app/api/itineraries/[id]/calculate-pricing/route.ts` once it has no callers.
- **Acceptance:** route gone; itinerary pricing happens only via the grid; pipeline intact.

### Phase D — Route the AI/quote + B2B flows through the core
_This is the step that genuinely makes the grid the source of truth here (no sibling equivalent at this scale)._
- `app/api/ai/build-quote`: drop `rate-lookup-service`/`getFallbackRates`; price via the shared core; honor `complete`/`holes` (a quote that can't be fully priced returns holes, not a guess).
- `app/api/b2b/calculate-price`: de-fabricate (remove `|| <number>` defaults), build the multi-pax table via the hardened engine, honor `complete`/`holes`; UI shows "incomplete pricing" when not fully rate-backed.
- **Acceptance:** no fabrication branch remains in either; both surface holes instead of guesses.

### Phase E — Collapse the leftover calculators
- `lib/tourCalculator.ts` (`/api/tours/calculate`) and `app/api/pricing/calculate` either route through the core or are deprecated/deleted if unused (grep callers first).
- Re-point harness tests at the core; extend golden masters to cover both surfaces.
- **Acceptance:** exactly one rate-resolution module; CI green.

### Phase F — _(optional, later)_ fold multi-pax rate sheets into the grid
- Only if desired; retires the B2B calculator UI. Not required.

---

## 4. What we are explicitly NOT doing
- **Not** rebuilding intake.
- **Not** altering the pipeline (itinerary, quotes, invoices, PDFs, send).
- **Not** retiring the B2B rate-sheet workflow (kept as a second surface fed by the core).
- **Not** unifying the underlying rate **tables** if the B2B flow reads different ones — that's a separate data-migration project (the sibling deferred it too).

---

## 5. Risks & guardrails
- **Redirect before delete** — never remove a route with live callers.
- **More calculators here** — Phase D/E are bigger than the sibling's; grep every caller before deleting.
- **Grid is isolated today** — confirm the load→edit→save round-trip is faithful before pointing pipelines at it (round-trip was lossy in the sibling; persist slot rate-IDs/day-types on save for a lossless version).
- Every phase lands behind the harness suite + CI.

---

## 6. Definition of done (whole consolidation)
- Exactly **one** rate-resolution module; **no `|| <number>` / `DEFAULT_RATES` / `getFallbackRates`** fabrication anywhere.
- The **grid is the canonical pricing surface**; the B2B rate sheet is a second surface fed by the same core; both report holes.
- `itineraries/[id]/calculate-pricing` **deleted**; `ai/build-quote` + `b2b/calculate-price` route through the core and honor completeness.
- Pipeline intact; all existing screens function.
- Harness + CI enforce all of the above.
