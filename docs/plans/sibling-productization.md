# Plan — The sibling becomes the product

**Status:** Proposed, nothing started. Decided 2026-08-27: the operator's goal is a
multi-tenant SaaS — any agency, any destination, monthly subscription per account,
**plus a self-hosted install option for clients who want it on their own server**.
The sibling (`autoura-saas-work`) is the commercial vehicle; THIS repo stays the
operating agency's deep ops tool and the design reference.
**Decision owner:** operator (Islam).
**Author:** drafted 2026-08-27 from a same-day inspection of both repos — every claim
below is measured, and the ones that aren't are marked.
**Corrected same day:** the first inspection ran on a LOCAL clone 128 commits behind.
Re-verified against the true `origin/main` (last commit 2026-08-25 — the sibling is
ACTIVE, not stale): tenancy and billing confirmed; still no per-rate currency, FX
freeze or destination vocabulary; its prompts still Egypt-hardcoded; suite healthy
(1545 tests passing). One finding REVERSED: migrations 291/292 show the sibling built
its own traveller↔office messaging (`trip_messages` + trip channel) — see P5.

## 1. Why the sibling, in numbers

Inspected 2026-08-27 against origin/main (last commit 2026-08-25):

**The sibling already has the entire "any agency" layer this repo lacks:**
- `tenant_id` on every rate table, suppliers, tour_templates, content_library,
  writing_rules, itineraries (verified in its DB types) — the exact 10-table gap
  measured here the same day. Per-tenant branding (logo, colours, currency, formats).
- A real Stripe stack: checkout, customer portal, webhooks, invoices, subscription
  state, trials, an onboarding fee, plan syncing (`lib/stripe.ts` + `app/api/billing/*`).
- Usage enforcement with structural + volume limits, grace bands, and fail-open
  telemetry (`lib/usage-enforcement.ts`, 259 lines — sophisticated).
- Self-serve `/signup`, public pricing page, super-admin tenant console.
- Its own Railway deployment with two cron services. 164 migrations.

**This repo has the product depth the sibling lacks (all of it recent):**
- Per-rate currency + FX freeze-at-approval + logged re-price ([[per-rate-currency]]).
- Multi-destination: global city vocabulary, destination-parameterised generation with
  golden-snapshot-pinned prompts, Settings UI, seams ([[multi-destination]]).
- Portal chat (staff↔traveller) with the notify-outcome model ([[portal-chat]]).
- The sibling's prompts are still Egypt-hardcoded (`egypt-glossary`, `EGYPT_CITIES`).

Rebuilding the sibling's tenancy/billing here ≈ months of mature infrastructure.
Porting this repo's designs there ≈ days per feature. The direction is settled.

## 2. The drift, measured — and what it means for porting

| Tree | Shared paths | Identical | Diverged | Only here | Only sibling |
|---|---|---|---|---|---|
| `lib/` | 71 | **3** | 68 | 113 | 39 |
| `app/api/` | 238 | **2** | 236 | 107 | 68 |

The repos share ancestry and layout, **not code**. Therefore every port below is a
**design port**: re-implement against the sibling's schema and conventions
(`tenant_id` scoping everywhere, `supabase/migrations/NNN_*.sql` numbering,
regenerated `database.types.ts`, its own test layout), using this repo's shipped code
as the proven specification. Do not cherry-pick commits; it will not apply.

Softer claims to re-verify at port time (typed-schema reads, not code inspection):
the sibling "has" seasons/rate-periods and activity tiers — its `lib/rates/rate-seasons.ts`
does not exist, so its seasons shape may differ from ours.

## 3. The destination model merge (do this thinking FIRST)

Ours: **global** vocabulary (`destinations` + `destination_cities` with coordinates,
JA labels, aliases; generation brief + glossary per destination).
Sibling's: **per-tenant** rows (`destinations`: tenant_id, name, slug, country) — a
label list, not a knowledge base.

The SaaS-correct shape combines them:
- A **shared global catalog** (countries, cities, coordinates, aliases, IATA codes) —
  maintained once, every tenant benefits; new tenants onboard onto an existing country
  instantly. This is a genuine product moat: the catalog is the thing competitors
  without an operating agency cannot easily seed.
- **Per-tenant selection and voice**: which destinations a tenant operates, plus THEIR
  generation brief / glossary / writing rules (tenant_id + destination_id scoping —
  two agencies selling Egypt write differently).
- Migration path for the sibling's existing per-tenant rows: map to catalog entries by
  country, keep their slugs.

## 4. The port list, in order

| # | Port | Source of truth here | Sibling prerequisites | Size |
|---|---|---|---|---|
| P1 | Global destination catalog + per-tenant selection (§3) | migrations `20260827_destinations*`, `useDestinationCities`, Settings page | merge with its per-tenant destinations | M |
| P2 | Destination-parameterised generation | `lib/ai/destination-context.ts`, prompt-builder golden-snapshot method | P1; extract ITS prompt templates first and pin them the same way | M |
| P3 | Per-rate currency (flat tables + hotels/cruises/packages) | `lib/rates/rate-currency.ts`, `RateCurrencyField`, migrations | tenant-scoped rate tables (already there); re-verify its seasons shape | M–L |
| P4 | FX freeze-at-approval + logged re-price | `lib/itinerary-fx.ts`, reprice-fx route | P3; its approval/booking flow may differ — find ITS confirm moment | M |
| P5 | RECONCILE messaging, don't port: the sibling has its own `trip_messages` thread (migration 291/292). Port only what ours adds — the notify-OUTCOME model (why the traveller wasn't told) and inbox-channel treatment — into ITS shape | `lib/portal/chat-reply.ts` NotifyOutcome | inspect its trip-channel flow first | S–M |
| P6 | This week's fix crop where UIs overlap (fixed-costs CSV, transport single-price, export-survives-missing-column, …) | respective PRs #226–#242 | none | S each |

Sizing legend: S ≤ half a day, M = 1–3 days, L = a week-ish — all as design ports.
Order rationale: P1/P2 are the "any country" enabler (without them every subscriber
is an Egypt agency); P3/P4 are what any international agency's accounting needs;
P5 is retention polish; P6 opportunistic.

## 5. Self-hosted installs (the operator's added requirement)

Some clients will buy the solution and run it on their own server. Consequences to
design in from the start, not bolt on:

- **Packaging**: one documented install path (env template, migration runner that
  applies `supabase/migrations` in order against a fresh Postgres, seed script for the
  global catalog). The sibling's hand-applied-in-SQL-editor migration convention does
  not survive self-hosting — a migration runner becomes a real deliverable.
- **Licensing/entitlement**: self-hosted ≠ Stripe-metered. Decide: license key with
  periodic check-in, honour-system annual license, or a "supported install" service
  contract. (Operator decision — §7.)
- **Update delivery**: tagged releases + upgrade notes; migrations must be strictly
  append-only and idempotent (the discipline this repo already practices).
- **Secrets**: self-hosters bring their own Anthropic/Twilio/Gmail keys — the
  provider-switch patterns the sibling already has (`WHATSAPP_PROVIDER`) generalise.
- **The global catalog** (§3) for self-hosted: shipped as seed data, updated with
  releases — not a live shared service, unless a later "catalog sync" is wanted.

## 6. What happens to THIS repo

- Remains the operating agency's production system and the **reference
  implementation** — features prove themselves here first (they just did, for two
  weeks straight), then port as designs.
- No new SaaS infrastructure gets built here (no billing, no tenancy hardening —
  G1 stays deferred forever in this repo; [[deferred-gates]]).
- The port campaign direction reverses the historical one (sibling→here, [[sibling-feature-port-campaign]]);
  update that memory when the first port lands.

## 7. Open questions — ANSWERED by the operator, 2026-08-27

1. **Self-hosted licensing: support contract.** A commercial arrangement, not an
   entitlement system — meaning NO license-key/check-in code needs building. Simplest
   possible outcome; §5's packaging and migration-runner work stands unchanged.
2. **Global catalog: self-serve.** Tenants add countries and cities themselves, the
   same Settings model that worked here. The catalog grows from tenant activity;
   curation is a later concern if quality drifts.
3. **Sibling state: live on Railway, 6 tenants created, ALL EMPTY.** Effectively
   pre-launch data-wise: P1 may restructure the destinations model boldly. Keep the
   6 tenant rows; there is no tenant data to migrate carefully.
4. **First market: Middle East and Africa.** Catalog seeding priority: Egypt, Jordan,
   Morocco, UAE, Kenya, Tanzania… — and a flag for later: MEA agencies will sooner or
   later want an **Arabic UI (RTL)**; the i18n stack should not paint that into a
   corner. Not scoped here; recorded so it is a known cost, not a surprise.

## 8. Suggested first motion

One PR on the sibling: bring its dependencies/tooling current, add ITS golden
snapshot tests for prompts and pricing (the referee pattern that made this repo's
refactors safe), and land this plan in its `docs/`. Then P1.
