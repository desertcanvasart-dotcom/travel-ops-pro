# Plan — Currency belongs to the rate, not the organisation

**Status:** Phases A–C built 2026-08-27. A (#232): schema + fetch-boundary normalizer + engines — migration `20260827_rate_currency.sql` APPLIED to prod by operator. B (#233): currency field on all 12 rate forms + bulk CSV Currency column. C: FX freezes at first confirm (`itineraries.fx_frozen`), explicit logged re-price (`POST /api/itineraries/[id]/reprice-fx`) restating lines from preserved originals — migration `20260827_itinerary_fx_freeze.sql` PENDING operator. Raised by the accounting department 2026-08-27.
**Decision owner:** operator (Islam), with accounting.
**Author:** drafted 2026-08-27.
**Accounting-facing summary:** https://claude.ai/code/artifact/01e3064e-078d-469f-97c7-55cee32c12e4

## 1. The problem

Accounting records transportation, guiding, meals and several other local services in
**Egyptian pounds**, and needs them to stay in Egyptian pounds — that is the currency the
supplier contract is written in and the currency the payable is settled in. Hotels, cruises
and flights are contracted in **USD**.

Autoura today holds **one rate currency for the whole organisation**
(`organizations.rate_currency`, resolved by `lib/org-rate-currency.ts`). Every rate in every
rate table is a bare number whose meaning comes from that single setting. There is nowhere to
say "this transfer is EGP and that cabin is USD".

The consequence is not that the system *breaks* — it is that it silently cannot represent the
truth. Either accounting pre-converts EGP into USD by hand (losing the payable figure, and
re-doing it every time the pound moves), or EGP numbers get entered into a USD-labelled system
and every total is wrong by ~50x.

## 2. The agreed principle

> A cost is **recorded** in the currency it was agreed in, permanently. The engine **converts a
> copy** when it needs a single total. The original figure is never overwritten.

Two columns of truth that never merge:

- **Recorded** — 9,700 EGP and 300 USD, held apart. This is what accounting pays.
- **Calculated** — $494.00, one number, derived and traceable line by line. This is what the
  customer is quoted.

## 3. What already exists (reuse, don't rebuild)

This is the important finding: most of the machinery is already written and running.

| Piece | Where | State |
|---|---|---|
| Dated FX conversion, never-guess policy | `lib/fx-conversion.ts` | Built. Basis is labelled `same-currency` / `historical` / `live` / `none`; an unbacked conversion returns `none` and the caller marks the result incomplete. |
| Rate history + today's rates | `exchange_rate_snapshots` (append-only), `exchange_rates` | Built, migration `20260811_share_links_and_fx.sql`. |
| EGP as a supported currency | `lib/exchange-rate-api.ts` `SUPPORTED_CURRENCIES` | Built. EUR↔EGP legs captured daily in production; cross rates derived through EUR at read time. |
| **Per-service** currency, original cost, rate used | `itinerary_services.supplier_currency` / `supplier_cost_original` / `exchange_rate_used`, migration `20260226_multi_currency_services.sql` | Built and wired: stamped in `lib/ai/service-creation.ts:1101`, read in `app/api/b2b/quote-from-itinerary/route.ts:294`, displayed in `app/itineraries/[id]/edit/page.tsx:1973`. |
| Per-line conversion with audit metadata | `convertLine()` / `buildFxMeta()` in `lib/fx-report.ts` | Built. |
| Money grouped by currency without merging | `sumByCurrency()` / `CurrencyTotals` in `lib/currency-totals.ts` | Built. |
| Guard tests against hardcoded currency | `__tests__/lib/no-hardcoded-rate-currency.test.ts`, `engine-rate-currency.test.ts`, `org-rate-currency.test.ts` | Built. |

The three-value audit trail accounting asked for is therefore already the schema. It currently
carries the same constant on every row only because `service-creation.ts` has one value to give
it.

## 4. The actual gap

**The rate tables have no currency column.** Confirmed absent on `transportation_rates`,
`guide_rates`, `meal_rates`, `accommodation_rates`, `entrance_fees`, `tipping_rates` and the
rest. `rateCurrency` is therefore a per-run constant threaded through `DayPricingParams`
(`lib/auto-pricing-service.ts:156`) rather than a property of each priced line.

The change is: **org-wide setting → per-rate value, with the org setting as the default.**

## 5. Data model changes

1. `ALTER TABLE <each rate table> ADD COLUMN rate_currency text NULL`.
   **Nullable, no backfill.** `NULL` means "use the organisation default", so every existing
   row keeps exactly the meaning it has today and no migration can change a price.
2. A resolver mirroring `getOrgRateCurrency`: `rate.rate_currency ?? org.rate_currency`,
   normalised through the existing `RATE_CURRENCIES` list.
3. No change to `itinerary_services` — its three columns already exist and are correct.

Currency sits on the **rate**, not on the rate period. A supplier contract is denominated once;
all dated periods of one rate share its currency. (Decision, not an assumption — state it.)

## 6. Engine changes

`rateCurrency` stops being a run-level parameter and becomes a property of each priced line.
Each line converts to the itinerary currency via `convertOnDate`, and the sum is guarded by the
existing policy: a line that cannot be converted produces an FX hole and marks the total
**incomplete** rather than being added as a bare number.

**Margin order is load-bearing.** Convert supplier cost into the selling currency *first*, then
apply margin. Margin is a commercial decision in the currency being sold in, not a by-product of
FX. This matches the existing arithmetic order in the pricing grid.

## 7. When the rate is frozen — DECIDED

While a quotation is being prepared it uses the current rate. **On itinerary approval the rate
is frozen onto the file** and stops moving.

Consequences that follow from that decision and must be built, not discovered:

- A service added *after* approval inherits the **frozen** rate, so one itinerary never carries
  two different rates for the same currency pair.
- Un-freezing is an explicit, logged action ("re-price at today's rate") with a user attached.
  A margin must never change because time passed.

Worked example of what freezing prevents: a trip quoted in March at 50 EGP/USD costs $494.00.
Opened in May at 55 EGP/USD with no freeze, the same untouched trip reports $476.36 and a
different margin.

## 8. Rate-entry surfaces that need the new field

- Every rate form under `app/rates/*`
- `RATE_TABLE_CONFIGS` in `lib/bulk-rate-service.ts` (a `Currency` column per table)
- The rate-periods sheet, `lib/rates/period-csv.ts` — read-only display of the rate's currency,
  since currency lives on the rate rather than the period
- The hotel/cruise identity sheet trimmed in PR #229 gains a `rate_currency` column

## 9. Display convention — DECIDED

People say **"50 EGP = 1 USD"**, so that is what the UI shows. The stored scalar is defined as
*supplier currency → itinerary currency*, which for a 5,000 EGP cost on a USD itinerary is
`0.02`. Both describe the same fact; showing one while storing the other unlabelled is a
2,500x bug waiting to happen. Label the column and keep the display string separate from the
stored number.

Note that USD→EGP is **not** a stored observation — snapshots hold EUR legs and cross rates are
derived through EUR at read time, so a USD→EGP conversion is two hops. Pin the rounding rule
once, in one place.

## 10. Known limits to state up front

- **FX history is shallow.** 152 snapshot rows as of 2026-08-27, starting when migration
  `20260811` landed — roughly three weeks. Anything dated earlier resolves `live`, not
  `historical`. Fine going forward; it means older trips cannot be re-reported at their true
  travel-date rate.
- **Accounting will meet incomplete totals.** The never-guess policy means a quotation will
  occasionally refuse to total rather than under-report. This is correct behaviour and should be
  communicated as such before it is first seen in the wild.

## 11. Open questions for accounting

1. Which services default to EGP? Transportation, guiding and meals are given. Entrance fees,
   tips, porterage, domestic flights?
2. Is approval the right freeze point, or should it be invoice? Invoice reports a margin closer
   to what actually happened but leaves the quoted figure moving for longer.
3. Which reports must keep the currency split? Payables clearly. Does the P&L also need it, or
   is a single reporting currency acceptable there?

Question 1 in particular changes the size of the job: it decides how much of the rate surface
needs the new field on day one.

## 12. Not in scope

- Changing how customers are billed. Billing currency (`itineraries.currency`) is a separate
  existing concept and is unaffected.
- Any change to the FX feed, snapshot cadence, or supported currency list.
- Retroactively re-pricing existing itineraries.
