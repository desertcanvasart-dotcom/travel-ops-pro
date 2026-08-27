# Plan — The destination becomes data

**Status:** Proposed, nothing built. Raised by the operator 2026-08-27 after clearing the
system's data: "what prevents this from working for other destinations?"
**Decision owner:** operator (Islam).
**Author:** drafted 2026-08-27, from a measured inventory of the codebase — file references
below were verified against the code that day, not assumed.

## 1. The question, answered first

Nothing architectural prevents it. The pricing engine is already destination-agnostic:

- **Rates are keyed by free-text city in the database.** There is no Egypt enum in the
  schema. A `transportation_rates` row for Amman works today, unchanged.
- **The cost taxonomy is universal**: transport, guide, meals, entrance, tips,
  accommodation, flights — what travel costs anywhere.
- **The methodology is universal**: rate × margin, dated rate periods, capacity bands,
  tiered activities, per-rate currency with freeze-at-approval (built 2026-08-27,
  [[per-rate-currency]]). None of it knows what country it is in.
- Suppliers, bookings, invoices, the portal, the unified inbox: all generic.

Things that look Egyptian mostly are not structural. The EU/non-EU entrance split is how
Jordan and India price too. Nile cruises and sleeping trains are product types — another
destination simply has no rows.

**Egypt lives in three places**: the UI's city vocabulary, the AI generation context, and
a residue of defaults. Each is inventoried below. The work is a decoupling inventory, not
a rebuild — the same shape as the per-rate-currency work: the engine was already right;
the job is moving one assumption ("the destination is Egypt") into data.

## 2. The agreed model

A `destinations` table in settings. Choosing a destination scopes everything below it:

```
destinations            (country, name, status)
  └─ destination_cities (name, aliases, coordinates, airport codes, timezone)
  └─ generation brief   (per-destination AI framing — see §4)
  └─ writing_rules      (destination_id NULLABLE — null = applies everywhere)
  └─ content_library    (destination_id)
  └─ attraction_aliases (destination_id)
```

Rate tables need **no schema change**: city stays free text, entered via dropdowns that
read `destination_cities` instead of the hardcoded list. Egypt is seeded as the first
destination from the data already in the code.

**Adding a destination becomes a content task, not a coding task**: someone who knows
Jordan fills in the cities, the brief, the attractions with entrance fees, and the
writing rules — through UIs that already exist (Content Library and Writing Rules
screens are built and in use).

## 3. What already exists (reuse, don't rebuild)

This is the decisive finding: the per-destination context mechanism the operator proposed
**is already how generation works internally** — it is just not scoped to a destination.

| Piece | Where | State |
|---|---|---|
| Writing rules as data, injected into every prompt | `writing_rules` table → `buildWritingRulesContext` → `lib/ai/prompt-builder.ts` | Built. Even has an `applies_to` column; lacks only `destination_id`. |
| Attraction knowledge as data | `content_library` (location, route, start/end city, tags, metadata) + `attraction_aliases` | Built, UI exists, in use. |
| Prompt assembly from data | generate-itinerary route builds attractionMenu + contentContext + writingContext from the tables at generation time | Built. |
| Free-text city keys on every rate table | all of `RATE_TABLE_CONFIGS` | Nothing to change. |
| Company identity in PDFs/emails | company profile ([[ats-source-defects-and-invoice-model]]) | "Egypt" strings there are letterhead, driven by profile. |

Today's prompt is: `[hardcoded Egypt framing] + [writing rules ← data] + [attractions ← data] + [content ← data]`.
The plan makes the first term data like the rest.

## 4. The generation brief (the operator's "context per destination")

A text field (or small structured record) on `destinations`, carrying what
`lib/ai/prompt-builder.ts` currently hardcodes (32 Egypt references): geography facts,
transfer norms and durations, pacing conventions, tone, seasonal notes. The Egypt row is
**extracted from today's prompt code**, so Egypt-generation output is unchanged by
construction — same words, new storage.

Scoping rule for writing_rules: `destination_id NULL` = global house style ("no
exclamation marks") stays global; "mention felucca timing at sunset" becomes Egypt-scoped.

## 5. The inventory — every Egypt coupling, classified

### A. Mechanical — replaced by the destinations/cities tables
- `messages/en.json` / `ja.json` `tourBuilder.cities` — the 45-city vocabulary (dropdown
  labels). Cities become rows; labels become per-city translations or plain names.
- `lib/constants/egypt-city-coordinates.ts` (180 lines) — becomes `destination_cities`
  coordinate columns; Egypt rows seeded from this file.
- `app/api/ai/parse-whatsapp/route.ts` `EGYPT_CITY_CODES` — city-code matching reads the
  selected destination's city aliases.
- Defaults: `CAI` airport (airport-services form), `Africa/Cairo` timezone (clients form)
  — become destination defaults.

### B. The real work — destination-parameterized generation
- `lib/ai/prompt-builder.ts` (32 Egypt refs) — consumes the generation brief (§4) instead
  of hardcoded framing; glossary block comes from data.
- `lib/ai/egypt-glossary.ts` (195 lines, only consumer is prompt-builder) — becomes
  per-destination glossary data (a `destination` column or a `destinations.glossary`
  JSONB; Egypt seeded from the file).
- `lib/auto-pricing-service.ts` attraction-alias map + the city-inference fallback that
  returns `'Cairo'` — aliases move to `attraction_aliases` (destination-scoped); the
  fallback becomes the itinerary's own destination default city, never a hardcoded name.
- `lib/tour-matcher-service.ts` (20 refs) — matches conversations to templates using city
  vocabulary; reads `destination_cities`.
- `lib/ai/cruise-detection.ts` (270 lines) — Nile-specific by content. Gate it on the
  destination having cruise products rather than deleting it; other destinations skip it.
- `lib/inclusions-builder.ts`, `lib/template-placeholders.ts`,
  `lib/ai/day-rules-engine.ts` — Egypt-flavoured copy and validation rules; sweep each,
  move destination-specific parts into the brief/rules data.

### C. Residue — sweep last
- "Egypt" strings in `invoice/contract/receipt/pdf-generator`, `email-send`,
  `communication-utils`, `translate-core`, `concierge-webhook-auth`, `bulk-rate-service`
  — mostly letterhead/example text; confirm each reads company profile, fix stragglers.
- Marketing/docs pages ([[public-site-feature-parity]]) — separate concern.

## 6. Build phases

**Phase 1 — destinations as data (days, not weeks).** Migration: `destinations` +
`destination_cities` (+ nullable `destination_id` on writing_rules, content_library,
attraction_aliases). Seed Egypt from the code's own lists. Settings UI (countries +
cities). Every city dropdown reads the table. Inventory A done.
*Deploy-safe pattern as always: nullable columns, code tolerates absence, Egypt seeded =
behaviour identical.*

**Phase 2 — generation follows the destination (the substantial part).** The brief field
+ prompt-builder consumes it; glossary and aliases to data; the `'Cairo'` fallback dies;
tour-matcher and parse-whatsapp read destination cities; cruise-detection gated.
Golden test: Egypt generation output before/after must match.

**Phase 3 — residue sweep + the first real second destination.** Enter one destination's
data end to end (cities, brief, attractions with entrance fees, a few rates), generate,
price, quote. The data entry is the moat, not the code: the system prices whatever it is
given, but the AI cannot invent Petra's ticket prices.

## 7. Limits to state up front

- **Quality tracks data.** A destination with three attractions entered generates thin
  itineraries. Egypt is good because years of content exist; a new destination starts
  from what is typed in.
- Single-org remains (G1 deferred, [[deferred-gates]]) — multi-destination lives inside
  one org; this plan does not touch org structure.
- Itinerary rows carry no destination today; Phase 1 adds `destination_id` to
  itineraries (nullable, backfilled to Egypt) so generation and defaults know which
  brief to load.

## 8. Open questions for the operator

1. Which is the first real second destination? (Decides whose data gets entered in
   Phase 3, and which conventions test the model — Jordan? Turkey? Gulf?)
2. Is destination chosen per itinerary at creation, or is there also an org-level
   default? (Suggest: per-itinerary field defaulting to the org's primary.)
3. Do city names need per-language display (like today's i18n city labels), or is the
   English name acceptable everywhere at first?
