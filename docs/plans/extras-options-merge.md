# One Extras list — merging Tours → Options into Sell → Extras

Status: **built** on branch `claude/extras-options-merge` (migration `20270107`). Written and decided 2026-10-19.

## Why

Two screens hold the same thing, an optional paid add-on with a cost and a price:

| | Sell → Extras | Tours → Options (per programme tier) |
|---|---|---|
| Table | `extras_catalogue` | `tour_variation_services` where `is_optional` |
| Where it is offered | every booking | one programme tier only |
| Price | blank = cost + margin; set = that is the price | the same rule (`optional_price_override`) |
| Currency | its own `rate_currency` | org currency only |
| Supplier | yes | no |
| Per person / per booking | yes | quantity modes |
| In production today | 1 row (horse carriage, Luxor) | **0 rows** across all 22 programme tiers |

The second half of the Options page, "Included in the programme", lists a tier's
`tour_variation_services`. Programmes are now built day by day in Tour Manager,
so that table is empty for every programme and that half can never show
anything.

Also found:
- A booking's add-on list shows a programme option once, **at the first tier's
  price found**, so a Deluxe trip could be offered the Standard price
  (`app/api/bookings/[id]/extras/catalog/route.ts`, "listed once — by name").
- The horse carriage ride is entered twice: once in Extras and twice in
  Rates → Activities.

## What it becomes

One list, **Sell → Extras**. Each extra says where it is offered:

- **Every booking** (what Extras does today), or
- **Only these programmes**: pick one or more programmes. Each pick can carry
  **its own price**. Blank = the extra's normal price.

The programme's Options button stays, as **"Extras this programme offers"**:
it lists the extras attached to that programme, lets you attach one from the
list or create a new one that is only for this programme, and set this
programme's price. The "Included in the programme" half is removed.

Pricing rule unchanged everywhere: a set price is the price (off-margin);
blank = cost + the usual margin. Hotel and ship upgrades (views, meal plans)
stay on the hotel/cruise rate. They belong to the room, not to a list.

## Database (one migration, safe to run twice)

- `extras_catalogue.offered_with` TEXT NOT NULL DEFAULT `'all'`,
  CHECK `('all','programmes')`. Every existing extra keeps today's behaviour.
- `extras_catalogue.activity_rate_id` → activity_rates (ON DELETE SET NULL).
- New `extras_catalogue_programmes`: `id`, `org_id`, `extra_id` → extras_catalogue
  (cascade), `template_id` → tour_templates (cascade), `selling_price` (nullable),
  `created_at`. Unique `(extra_id, template_id)`.
  RLS like `extras_catalogue` (company members read; manager+ write).
- **Data move:** every `tour_variation_services` row with `is_optional = true`
  becomes an extra (`offered_with='programmes'`, name/cost/category copied) plus
  one link to its programme. Same name on several tiers → one extra, one link.
  An extra with the same name already in the company is reused. Production has
  0 such rows; this is for other installs. The old rows stay; the engine no
  longer sells optional variation services.
- Recorded in `schema_migrations`; replayed in PGlite (`npm run replay:schema`)
  before you apply it.

## Code

1. **One reader:** `lib/extras/offered.ts` `loadOfferedExtras(db, orgId, templateId)` →
   every-booking extras + extras linked to this programme, at the programme's
   price when set, with the Activities rows they cost from. Used by:
   - the B2B calculator's extras picker and `calculate-price` (`loadExtras`),
   - a booking's add-on list (`/api/bookings/[id]/extras/catalog`),
     which drops its separate `package_option` source and the
     first-tier-price bug with it,
   - (the traveller portal only answers extras the office has already
     offered on the booking, so it needs no change).
2. **Extras page:** an "Offered with" column and field; programme picker with
   a price per pick; cost typed or from an Activities rate.
3. **Programme page** (`/tours/variations/[id]/options`): rewritten on the links.
4. **Retired:** no screen writes `is_optional` / `optional_price_override` any
   more, and `calculate-price` skips optional variation services (they are
   Extras now). Old `booking_extras` rows with source `package_option` keep
   displaying (none exist in production).
5. Activities: deleting an activity an extra costs from is refused
   (`lib/rates/service-rate-in-use.ts`).
6. Tests: `__tests__/lib/extras-offered.test.ts` (offering, programme price,
   activity cost) and `__tests__/migrations/extras-programmes-and-activity.test.ts`
   (the data move on a real Postgres, twice).

**Deploy order: migration FIRST, then the code.** Reads tolerate an
unmigrated database (`select('*')`, a missing `offered_with` = every booking),
but saving an extra sends the new columns and would fail without it.

## Decisions (operator, 2026-10-19)

1. **Programme level, not per tier.** A link is extra × programme with one
   optional price; every tier's Extras button opens the same list. The data
   move collapses tiers: named and costed from Standard, a tier's set price
   (Standard's first) on the link.
2. **Quote Builder (Pricing Grid) extras picker: separately**, not in this change.
3. **Cost from Activities: yes, in this change.** `extras_catalogue.activity_rate_id`;
   the cost is the activity's rate for the trip's group (tiers, per person, per
   group, per unit), non-EUR at booking time (a booking records no passport).
   Deleting an activity an extra costs from is refused, naming the extra.
4. **Attractions marked "sellable extra": kept as they are.**
