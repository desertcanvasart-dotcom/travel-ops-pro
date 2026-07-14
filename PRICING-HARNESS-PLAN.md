# Pricing Correctness Harness — Implementation Plan (travel-ops-pro)

_Status: PROPOSED (awaiting approval). No code yet — this PR is the plan only._
_Scope: make the pricing module deliver only **definite** prices — never fabricated, never AI-invented._
_Ported and adapted from the sibling app (autoura-saas), where this harness shipped as PR #5 (Phases 0–5 + consolidation A–E, 187 tests, CI green). This repo is the larger sibling: more rate types, more pricing surfaces, more fabrication points._

---

## 0. Governing principle (the one rule everything serves)

> **A price is deliverable only when every component traces to a real, in-date database rate.**
> **When data is missing, the system flags the hole — it never guesses, defaults, or invents a number.**

Everything below exists to enforce that rule and to prove it stays enforced in CI.

---

## 1. Current state (verified against the code, 2026-06-21)

Five risk classes were found and confirmed by reading the source. This codebase fabricates in **more** places than the sibling did before it was hardened.

### Risk 1 — The engine silently fabricates via a hardcoded `DEFAULT_RATES` table
- `lib/auto-pricing-service.ts:306` defines `DEFAULT_RATES` (per-tier hotel/cruise/guide/meal/transport/airport-service/hotel-service/vehicle).
- It is substituted at **~18 call-sites** on a DB miss, each adding a guessed amount to the total and returning success:
  - cruise `:931`, `:932` · hotel `:1026`, `:1027` · guide `:1190`, `:1197` · meals `:1218`, `:1219`, `:1236`, `:1237` · airport service `:1260`, `:1263`, `:1265` · hotel service `:1288`, `:1291`, `:1293` · single-supplement `:1796` · accommodation PPD `:1977` · vehicle `:2193`.
- `success` currently means "did not throw" — it carries no correctness meaning. A full quote can be produced with **zero real rates** and still look final.

### Risk 2 — A second fabricator: invented "fallback rates"
- `lib/rate-lookup-service.ts:1522` "FALLBACK RATES (when database is empty)" → `getFallbackRates()` at `:1525` invents per-pax numbers (≈ €50 sedan / €18 entrance / €15 tips) and returns `success: true`.
- `calculatePricingFromRates()` (`lib/rate-lookup-service.ts:~1500`) returns `success: true` even when every underlying lookup failed (all components €0).

### Risk 3 — Real AI hallucination in the quote builder
- `app/api/ai/build-quote/route.ts:4` imports `getFallbackRates`; at `:173–181` it falls back to those invented numbers when template + rate lookup both fail, then returns the quote tagged only by a `source: 'fallback_rates'` **string** — a fully made-up quote that no caller is forced to notice.
- `app/api/pricing-grid/parse/route.ts` trusts AI-emitted raw numbers for catch-all slots (water / other_group / other_pp) rather than only validated rate IDs (same gap the sibling fenced in its Phase 3).

### Risk 4 — Fuzzy / approximate matching substituted as if exact
- Hotel tier-fallback `standard → deluxe → budget` (`lib/auto-pricing-service.ts:983`) uses a different tier's rate as if it were the requested tier.
- Attraction name partial match >50% overlap (`:1076`).
- Guide any-language / any-active fallback (`:1165`).
- Pervasive `|| 0` null→€0 coercion on rate fields (hotels `:1033`, entrance `:1100`, guide `:1134`, meals `:1231`) — a missing field silently becomes a €0 line and is never flagged.

### Risk 5 — No safety net
- **Vitest is wired up** (`vitest.config.ts`, `test`/`test:watch`, `@/` alias) — but the 7 existing tests cover concierge / cruise / parsing only. The **pricing engine has zero tests**, no supabase mock, no fixtures, no golden masters.
- **No rate-entry validation** — the ~20 `app/api/rates/**` CRUD routes (+ bulk import) accept negative / NaN / absurd money.
- **No output sanity check** before a price reaches a customer.
- **No CI** — there is no `.github/workflows`.

### What is already healthy (build on it)
- The core engine is **deterministic given DB state** (no `Date.now()` / random in the pricing math).
- Found-rate line items already carry a `rateSource` string — provenance is half-built; we extend it.
- Vitest + `@/` alias already match the sibling's setup, so the test harness ports cleanly.
- A **pricing grid module already exists** (`app/pricing-grid/`, `lib/calculator.ts`, `lib/slot-mapping.ts`) — the single-source-of-truth target (see `PRICING-CONSOLIDATION-PLAN.md`).

---

## 2. Target data model (the contract the whole harness asserts)

Port the sibling's types verbatim, then adapt to this engine's return shapes.

```ts
// lib/pricing-types.ts (new — ported from sibling)

export type RateSource =
  | 'db'        // a real, in-date rate row was used  → the ONLY deliverable source
  | 'fuzzy'     // matched, but via keyword/ilike/tier-substitution — blocks (needs confirmation)

export type HoleKind =
  | 'hotel' | 'cruise' | 'guide' | 'meal' | 'entrance' | 'transport'
  | 'tipping' | 'airport_service' | 'hotel_service' | 'flight' | 'activity'

export interface PricingHole {
  kind: HoleKind
  dayNumber?: number
  city?: string
  tier: ServiceTier
  message: string           // "No hotel rate for 'Aswan' (deluxe). Add it in Rates → Hotels."
}
```

Pricing results gain `complete: boolean` + `holes: PricingHole[]`. Missing **or** fuzzy → push a `PricingHole`, set `complete = false`, **add nothing to the total**. `DEFAULT_RATES` and `getFallbackRates()` are removed from the deliverable path entirely.

---

## 3. The six layers (mirror of the sibling's harness)

### Layer 0 — Test harness (BUILD FIRST)
- **Reuse** the sibling's `vitest.config.ts` (already equivalent here) and **port** `__tests__/_mock-supabase.ts` (in-memory supabase query-builder mock) + `__tests__/fixtures/` (hermetic rate-table rows + representative templates).
- **New tests:** golden-master ((template × tier × pax) → locked totals), invariants (`per_person × pax ≈ total`, no NaN/negative, determinism), and **characterization tests that pin today's fabrication** (missing hotel rate → currently `success:true` + a fabricated line) so Layer 1 can intentionally flip them.
- **Acceptance:** `npm test` green; current behavior locked before any change.

### Layer 1 — Provenance + "flag the hole, never fabricate" (the core fix)
_Files: `lib/auto-pricing-service.ts`, `lib/rate-lookup-service.ts` (+ new `lib/pricing-types.ts`)._
- **Delete `DEFAULT_RATES`** and replace all ~18 substitutions with a `PricingHole` + `complete = false`, adding nothing.
- **Delete `getFallbackRates()`**; `calculatePricingFromRates()` returns `complete:false` + holes when lookups fail (never `success:true` on €0).
- Every lookup (`getHotelRates`/`getCruiseRates`/`getGuideRate`/`getMealRates`/`getTippingRate`/`getAirportServiceRate`/`getHotelServiceRate`/`getEntranceFee`/`findTransportRate`) returns provenance (`'db'|'fuzzy'`) or `null` — never a default.
- Fuzzy paths (tier-fallback, attraction partial match, guide any-language) → `'fuzzy'` and **block**.
- This is larger than the sibling's Layer 1: two fabricators, ~18 call-sites, more rate types.
- **Acceptance:** a fixture with a deliberately missing rate yields `complete:false`, populated `holes[]`, and a total with no guessed amount; characterization tests flipped.

### Layer 2 — Output sanity gate (the wall before the customer)
_New: `lib/pricing-guards.ts` (port). Wired into **all 8** emit paths (sibling wired 2)._
- `assertDeliverablePrice(...)` rejects zero/negative/NaN, bad `per_person × pax`, out-of-range margin, missing currency, non-`db` lines, and `complete:false`.
- Wire into: `app/api/pdf/generate`, `app/api/b2b/quotes/[id]/pdf`, `app/api/b2b/quotes/[id]/convert`, `app/api/whatsapp/send-quote`, `app/api/whatsapp/send-invoice`, `app/api/send-email`, `app/api/itineraries/[id]/generate-documents`, `app/api/itineraries/[id]/generate-commissions`.
- **Acceptance:** an incomplete/zero quote is blocked from every send path with an error naming the holes.

### Layer 3 — AI fencing (kill the hallucination vector)
_Files: `app/api/pricing-grid/parse/route.ts` **and** `app/api/ai/build-quote/route.ts`._
- Grid parser: catch-all slots never turn an AI number into a price → `needsHumanInput`, kept only as a non-binding hint.
- `build-quote`: the `getFallbackRates` path is removed in Layer 1; build-quote must return a **hole**, never a guessed quote.
- **New test:** adversarial AI output (invented number, bogus rate ID) is zeroed/flagged, never priced.

### Layer 4 — Rate-data integrity + coverage report
_New: `lib/rate-validation.ts` (port) + `lib/pricing-coverage.ts` (port) + `app/api/pricing/coverage`._
- `validateRatePayload` (reject negative/NaN/>1M money) wired into the ~20 `app/api/rates/**` CREATE routes **and the bulk-import path** (`app/api/rates/bulk/import`).
- Coverage endpoint runs the strict engine across templates × tiers and lists every hole before a customer hits one.

### Layer 5 — CI + drift guard
- **New:** `.github/workflows/ci.yml` (port) — `npm test` + scoped `tsc` on PRs/pushes to `main`, Puppeteer download skipped.
- **New:** `tsconfig.ci.json` (port) — type-checks the harness lib files only (full app tsc needs `.next/` from a build).
  _(Superseded 2026-07-14: CI now runs `next typegen` + FULL `tsc --noEmit`; tsconfig.ci.json was removed — the scoped check had let an app-code type error merge with green CI.)_
- **New:** golden-basket drift guard — inline-snapshot of per-person prices for all tiers × passport types.

---

## 4. Build order & estimate

| Phase | Layer | Risk addressed | Rough effort |
|---|---|---|---|
| 0 | Test harness | locks behavior (5) | 1 day |
| 1 | Provenance + flag-the-hole | silent defaults (1,2,4) | 2–3 days (two fabricators) |
| 2 | Output gate | reaches-customer (1,2) | 1 day (8 routes) |
| 3 | AI fencing | hallucination (3) | 0.5–1 day |
| 4 | Rate validation + coverage | data gaps (4) | 1–1.5 days (~20 routes + bulk) |
| 5 | CI + drift guard | regression | 0.5 day |

Larger than the sibling's PR #5 — I'd land it as **several PRs**, each behind green tests.

---

## 5. Directly reusable from the sibling (copy-and-adapt, not rewrite)
`lib/pricing-types.ts` · `lib/pricing-guards.ts` · `lib/rate-validation.ts` · `lib/pricing-coverage.ts` · `lib/pricing/rate-resolution.ts` (facade) · `__tests__/_mock-supabase.ts` · golden-basket test shape · `.github/workflows/ci.yml` · `tsconfig.ci.json`.

---

## 6. Open decisions (need a call before/while building)
1. **Browse "from €X" range** — remove `DEFAULT_RATES` outright, or keep behind a clearly-labeled non-deliverable `estimate` flag used only for the starting-price cache? (Recommendation: remove; show "price unavailable" when incomplete.)
2. **Fuzzy matches** — block (treat as hole) vs. soft-confirm. (Recommendation: block, matching the sibling.)
3. **`getFallbackRates` callers** — confirm `build-quote` is the only consumer before deleting (grep first).

---

## 7. Definition of done (whole harness)
- `npm test` green in CI on every PR.
- No code path adds a number to a price without `rateSource: 'db'`.
- A missing rate → a hole + non-deliverable price, never a guessed total.
- No price reaches a PDF/email/WhatsApp/invoice/document without passing `assertDeliverablePrice`.
- The AI can select real rates but cannot emit a price number anywhere.
- A coverage report lists every gap in the current rate data.
