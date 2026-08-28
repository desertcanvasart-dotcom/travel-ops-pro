# Extras and upgrades — selling something after the trip is sold

Status: **scope, not built.** Nothing in this document exists yet.
Written 2026-08-28 after an investigation of how the system handles a customer
who has bought a programme and then wants business class, or an extra tour.

---

## 1. What exists today

Four things look like this feature and none of them is it.

**`entrance_fees.is_addon` / `addon_note`** — a catalog label with no consumer.
The rate form has a toggle; the tour manager uses the flag to *exclude* those
attractions from the main list (`app/tours/manage/TourManagerContent.tsx:916`);
the supplier-document editor draws an amber chip. Nothing prices an add-on,
offers one, or sells one.

**Optional services — real on one pricing path, vestigial on the other.**
Tour template and variation services carry a genuine `is_optional` column
(`/api/tours/templates/[id]/days`, `/api/tours/variations/[id]/services`), and
the B2B calculator honours it properly: optional lines are kept out of the
subtotal, returned separately as `optional_services`, and added only when the
caller passes `include_optionals`
(`app/api/b2b/calculate-price/route.ts:826`). That is a working feature — for
**pre-sale B2B quotes off a tour template**. It is not a post-purchase channel,
and it has no customer-facing surface.

The auto-pricing engine — the path `generate-itinerary` actually uses — does
none of that. It sets `isOptional: false` at all fourteen sites where it builds
a service, and instead splits optional from non-optional on
`s.notes?.includes('optional')`, a substring test against engine-generated free
text that nothing ever writes. `optionalTotal` is hardcoded `0` in all four
return paths (lib/auto-pricing-service.ts:3252/3254, 3663/3665). So on the main
path the array is always empty, the total is always zero, and the flag the B2B
calculator respects is dropped on the floor.

**`flight_rates.cabin_class`** — economy / business / first exists in the rate
catalog, and **no pricing path reads `flight_rates` at all**: only the rate CRUD
screens and the pricing grid touch that table. A business-class fare can be
recorded and nothing can price it into a trip. There is no delta concept —
"upgrade from X to Y for +N" — anywhere.

**`booking_change_requests`** — the one post-purchase customer channel that
genuinely works end to end (portal form → manager notification → operator
approve → auto-reprice → passenger rows seeded). It is restricted at the
database level to exactly one kind:
`CHECK (kind IN ('add_traveller'))`.

There is also a **real precedent** that nobody has generalised: travel
insurance. A traveller picks a plan in the portal (a *request*), the office
confirms it in `/api/bookings/[id]/insurance` where the premium is re-resolved
server-side from the rate table and never taken from the request body, and
`/api/invoices` appends it as its own line — added to the trip total, excluded
from the deposit base, refused outright if the invoice currency is not the
currency the insurer published. That is exactly the shape an extra needs. It is
hardcoded to one product.

## 2. Why the money is the hard part

Adding a paid extra to a confirmed booking today does not work, and the reason
is not missing UI.

1. **The booking total is frozen at confirmation.** The booking is created once
   (`lib/booking-creation.ts` `buildBookingRow`) copying the itinerary or quote
   total; there is no itinerary → booking re-sync afterwards.
2. **The API refuses to move it.** `PATCH /api/bookings/[id]` has an allow-list
   that includes `deposit_amount` and `balance_due` but **not `total_cost`**
   (app/api/bookings/[id]/route.ts:107). *(Yesterday I called this column
   `total_amount`; the column is `total_cost`.)*
3. **Hand-editing the balance is silently undone.** `record_booking_payment()`
   recomputes `balance_due := greatest(0, total_cost - total_paid)` on every
   payment (migrations/20260624_record_booking_payment_atomic.sql:100). So the
   one workaround available — bump `balance_due` by the price of the extra —
   survives exactly until the customer's next payment, then vanishes.

Any design that bills an extra without moving `total_cost` is wrong for this
reason. That single fact decides most of what follows.

A second trap: `computeAddTravellerReprice` extends the agreed price as
`oldTotal / oldPax × newPax`. If extras were folded into `total_cost` naively,
one traveller's business-class upgrade would be divided across the party and
charged again to every traveller added later.

## 3. The model

One table, booking-scoped, holding both add-ons and upgrades.

```
booking_extras
  id, org_id, booking_id            -- org-scoped, cascade from booking
  passenger_id      NULL            -- NULL = whole booking; set = one traveller
  kind              'addon' | 'upgrade'
  title, description
  quantity          INTEGER > 0
  unit_price        NUMERIC NULL    -- SELLING price; NULL = not priced yet
  currency          TEXT            -- the extra's own currency
  supplier_cost     NUMERIC NULL    -- NULL = unpriced hole, never 0
  supplier_currency TEXT NULL
  supplier_id       NULL            -- who provides it, for the manifest
  source_kind       NULL            -- 'entrance_fee' | 'flight_rate' | 'manual'
  source_id         NULL            -- catalog row it was priced from
  replaces_service_id NULL          -- upgrades: the itinerary_service superseded
  status            see §4
  requested_via     'portal' | 'operator'
  created_at, priced_at, confirmed_at, confirmed_by,
  resolved_at, invoiced_at, invoice_id
```

Plus two nullable columns on `bookings`:

```
base_total_cost  NUMERIC NULL   -- the agreed tour price, without extras
extras_total     NUMERIC NULL   -- Σ confirmed extras
```

with the invariant **`total_cost = coalesce(base_total_cost, total_cost) + coalesce(extras_total, 0)`**.

Why this shape:

- `total_cost` keeps meaning "what this customer owes for this trip", so the
  payment RPC, the invoice routes, the payment schedule, the dashboard money
  row and the client stats all keep working with no change.
- `base_total_cost` gives `computeAddTravellerReprice` a per-person base that
  excludes extras — fixing the trap in §2 by construction.
- Both columns are nullable and default absent, so a booking that never has an
  extra is byte-identical to today. Readers use `coalesce(base_total_cost,
  total_cost)`; deploy and migration can land in either order.

**An upgrade is stored as a delta, not a replacement price.** `unit_price` on an
upgrade is the *difference* ("Economy → Business, +€820"). The original service
stays in the itinerary untouched. This keeps the arithmetic additive — the same
formula totals add-ons and upgrades — and keeps the agreed base price intact.

## 4. States

```
                 office prices it
  requested ─────────────────────►  offered
 (customer asks,                   (priced, waiting on the customer)
  no price)                            │ customer accepts
                                       ▼
  offered ◄──── office proposes ──── accepted
                                       │ office secures it with the supplier
                                       ▼
                                   confirmed   ← money moves HERE, and only here
                                       │
                                       ▼
                                  (invoiced_at stamped when it reaches an invoice)

  terminal: declined (customer said no) · withdrawn (office cancelled)
```

Two entry points, one path. The customer can start it (`requested`, unpriced) or
the office can start it as an upsell (`offered`, priced). **Price is only ever
set by the office** — never taken from a portal request body, exactly as the
insurance confirm route already does with the premium.

`confirmed` is the only state that touches money. Everything before it is
conversation. This is what makes the recompute a pure function of the extras
list, and what makes it safe to run repeatedly.

## 5. Rules that are not negotiable

**Extras settle with the balance, never the deposit.** `deposit_amount` stays
keyed to `base_total_cost`. This follows the insurance precedent, and it means
confirming an extra can never restate a deposit invoice that has already gone to
the customer. (The alternative — extras before deposit payment join the deposit
base — adds a branch and a class of "why did my invoice change" support mail.
Not worth it.)

**Never convert a currency to make an extra fit.** If the extra's currency
differs from the booking's, it does not enter `extras_total`; it is billed on
its own invoice in its own currency, and the UI says so. Same discipline as the
JPY insurance guard in `/api/invoices`, and the same rule the rate forms
already enforce: a blank price is a hole, never zero.

**An unpriced extra never totals.** `extrasTotal()` refuses to sum a list
containing a confirmed extra with `unit_price IS NULL`, and reports which one.
Confirming without a price is rejected at the API.

**Extras do not enter the itinerary.** No `itinerary_services` rows, no pricing
engine involvement. An extra is a commercial fact agreed *after* the trip was
priced; folding it back would re-open the negotiated price and fight the
FX-freeze model — and the edit page recomputes `itinerary.total_cost` from
Σ services on every save, so an extra written there would be silently dropped by
the next itinerary edit. Operations still see it: confirming an extra with a
supplier inserts a `booking_supplier_status` row, so it appears on the existing
manifest and gets confirmed like any other service.

## 6. Phases

Each is one gated PR. **Exactly one migration**, in E0, carrying every column
E1–E5 need — the operator applies SQL by hand, so this must not become a drip.

**E0 — the money spine.** Migration (table + two booking columns) and
`lib/booking-extras.ts`: `extrasTotal()`, `applyExtras()`, `nextStatus()` as
pure functions with tests. Fix `computeAddTravellerReprice` to divide
`base_total_cost`. No UI, nothing user-visible changes.

**E1 — the operator can sell one.** `/api/bookings/[id]/extras`
(GET/POST/PATCH/DELETE) with the state machine enforced server-side and the
booking recompute on every confirm/withdraw; an Extras panel on the booking
detail page, next to the existing change-requests panel. Manifest row on
confirm. **After E1 the feature works** — the office can add "extra Abu Simbel
day, €340", confirm it, and the balance is right.

**E2 — it reaches the paperwork.** `/api/invoices` picks up confirmed,
un-invoiced extras as line items and stamps `invoiced_at`/`invoice_id`; deposit
invoices exclude them, final and standard include them. The insurance block and
this one go through **one** helper, so a third kind of extra does not add a
third copy. `/api/profit-loss` reads itineraries, not bookings, so extras are
invisible to it today — join `booking_extras` by `itinerary_id` and add their
revenue and `supplier_cost`, or P&L will report the margin as pure profit.

**E3 — the customer can ask, and can accept.** Portal Extras section: what the
office has offered (with price, Accept / Decline) and a free-text "request
something" form. Booking-level link requests booking-scope extras; a private
per-traveller link only ever sees and touches that passenger's own — same
`passenger_id` branching as the documents work. Behind the verify gate,
rate-limited, `notifyOrgManagers` on a new request, and a needs-attention reason
so a request older than a day surfaces on the dashboard.

**E4 — pricing from the catalog.** `entrance_fees WHERE is_addon = true` finally
gets its consumer: pick an add-on, price it from the rate table with the org
margin applied (`lib/org-default-margin`). Activities and tours the same way.

**E5 — flight class upgrades.** Delta between the booked cabin and the target
cabin from `flight_rates`, per passenger. Largest and least certain, because
**nothing prices flights today** — the itinerary has no flight service to
upgrade *from*, so this phase has to establish that first. Last, and only if
this is really sold.

E0–E3 is the useful minimum: a customer can be sold an extra tour or an upgrade
and it bills correctly. E4 and E5 are convenience and coverage.

## 7. The optional-services split, which is NOT part of this

The vestigial half of §1 — the auto-pricing engine's notes-substring filter and
its hardcoded `optionalTotal: 0` — should either carry `is_optional` through
properly or be deleted. It is deliberately **not** in E0 or anywhere else in
this plan: wiring it changes subtotals on the main pricing path, which is
snapshot-pinned, and it is a pre-sale concern ("would you like to include the
balloon ride in this quote?") rather than a post-purchase one. Different
feature, different PR.

What it does give this plan is E4's source of truth: template services already
flagged `is_optional` are the operator's own curated list of what can be added
to a given tour, which is exactly what an extras picker wants to offer.

## 8. What this does not do

- No self-serve payment. An extra raises the balance and lands on an invoice;
  the existing payment flow collects it.
- No change to `booking_change_requests`. Party size changes pax and seeds
  passenger rows — structurally different from a priced line item. Two intakes
  is correct here; overloading `kind` would put two unrelated approval flows in
  one table.
- No cancellation or refund of a confirmed extra beyond `withdrawn` reversing
  the total. Partial refunds are the existing payments problem, not this one.

## 9. Risks

| Risk | Mitigation |
|---|---|
| A design that moves `balance_due` without `total_cost` is erased by the next payment | §2, §3 — extras move `total_cost` |
| One passenger's upgrade divided across the party by the add-traveller reprice | `base_total_cost`, fixed in E0 |
| Confirming an extra restates an invoice already sent | Extras settle with the balance only (§5) |
| Extras revenue booked as pure profit | E2 adds them to `/api/profit-loss` with their supplier cost |
| No real usage to validate against — every one of these tables is empty in production | Walk one real case with the operator at the end of E1, before E2 builds on it |

