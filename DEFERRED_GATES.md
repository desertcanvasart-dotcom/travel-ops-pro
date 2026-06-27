# Deferred Gates — required work blocked behind a specific future event

This file tracks **architectural changes deliberately deferred** because they're not
worth doing yet, but **must** ship before a specific future condition is met. Each
entry is a gate — it names the trigger plainly so the work can't be missed when the
trigger fires.

This is NOT a general-purpose TODO list. It's a short list of hard gates with named
triggers. Bug fixes go to AUDIT-FINDINGS.md. Roadmap-level "nice to haves" live in
PROJECT_HANDOVER.md → Known Issues. Items in this file BLOCK something.

---

## G1. org_id authority must move to the thread before any second org onboards

**Status:** Deferred — solo operation today, work is gated, not abandoned.
**Trigger:** [GATE — REQUIRED BEFORE SECOND ORG ONBOARDS]
**Owner:** Architecture / multi-tenancy.
**Related code:** `lib/auth/current-org.ts`, `app/api/copilot/threads/[id]/commit-itinerary/route.ts`, `migrations/20260626_*concierge*.sql`, `migrations/20260627_itinerary_thread_id.sql`.

### What's broken (today, only in a multi-org world)

`org_id` on every committed itinerary is currently stamped from
`getCurrentOrgId()` — the operator's session — at the moment they click "Create
itinerary from brief." For a single-org operation this is trivially correct. The
instant a second org is onboarded it becomes a **misattribution risk on a
financial entity**: an itinerary created from a Concierge brief will belong to
whichever org's operator happens to click commit first, not to the org the lead
actually came from. There is no automatic correction path post-stamp.

`communication_threads.org_id` already exists (Phase 2 intake-stamping shipped),
but commit does not yet read it.

### What ships when the gate trips

Agreed fix shape (from prior design conversation, recorded here so it can't drift):

1. **org_id becomes authoritative on the thread/brief at intake**, not at commit.
   A per-org webhook secret (each org gets a different `CONCIERGE_WEBHOOK_SECRET`;
   the verifier already identifies which secret matched, so the org is implied by
   the signature) resolves which org owns an inbound Concierge brief. WhatsApp
   intake stamps similarly, resolved from the inbound number/channel config.
2. **`communication_threads.org_id` becomes `NOT NULL`** with a backfill pass on
   any rows still carrying NULL (today, all of them inherit a single default org
   — fine).
3. **Commit reads `thread.org_id` for the itinerary stamp** and uses
   `getCurrentOrgId()` *only as a membership/access check* — 403 if the operator
   is not a member of the thread's org. Session stops being authoritative; it's
   an access control input, not an attribution input.
4. **UI shows it explicitly**: button label becomes
   "Create itinerary in `<org name>`" so the operator sees what's about to happen
   and has no surprise about which org's books the itinerary will land in.

### Why this isn't built yet

Phase 2 intentionally split the work: it shipped the **intake stamping** (cheap,
no behavior change), so when the gate trips the data is already populated and
the write-paths already stamp. What's gated is the **authority flip + membership
check + NOT NULL + UI label** — a coordinated rewrite that's only meaningful in a
multi-org world.

### Structural protection now in place (post-audit hardening)

The Phase 2 audit flagged a latent fragility: the revision-UPDATE path at
`lib/concierge-brief-intake.ts` preserved `concierge_briefs.org_id` only
because `mapped.briefRow` from the brief mapper happened not to contain
`org_id`. A future change to the mapper could have silently clobbered the
stamp on revision.

That protection was lifted from this doc to the code:

  1. The UPDATE-side guard at `lib/concierge-brief-intake.ts` destructures
     `org_id` out of `mapped.briefRow` by name BEFORE the spread, so the
     UPDATE structurally cannot include `org_id` even if the mapper later
     emits it (`const { org_id: _doNotClobberOrgId, ...spreadable } = ...`).
  2. A short comment at `lib/concierge-brief-schema.ts`'s `briefRow`
     declaration warns against adding `org_id` to the mapper output and
     points at the destructure-guard.

When the G1 work coordinates an actual signature-aware resolver at the
mapper level, both call sites need to be revisited together — the
destructure-and-omit and the mapper comment.

### Verification checklist for when the gate trips

- [ ] Per-org webhook secret resolver in `app/api/webhooks/concierge/route.ts`
      and per-channel resolver in WhatsApp intake
- [ ] Backfill any `communication_threads.org_id IS NULL` to the per-org resolved
      value, then `ALTER TABLE ... ALTER COLUMN org_id SET NOT NULL`
- [ ] `commit-brief-to-itinerary.ts` takes thread.org_id as authority, not the
      param `orgId`; route passes session user to a `verifyMembership(orgId,
      userId)` check
- [ ] Commit route returns 403 with a clear message on cross-org access attempts
- [ ] `CopilotReviewPanel` button label shows the resolved org name
- [ ] End-to-end test: two orgs, brief lands in org A; operator B (member of
      org B only) sees 403 on commit; operator A (member of org A) succeeds and
      the itinerary lands in org A regardless of who else is logged in

### Bundled into this gate: suppliers.org_id (Phase 3 step 2 finding)

The `suppliers` table has NO `org_id` column today. For solo operation this
is the same kind of latent issue as `communication_threads.org_id` was —
trivially correct under one org, structurally broken under two. But it is
WORSE than the thread case: a shared unscoped suppliers table is a
**CROSS-TENANT DATA LEAK** the instant a second org exists, not just a
misattribution risk. Any second org's operator would see every other org's
supplier roster, rate cards, contact info, payment terms, and commission
agreements.

Phase 3 step 2 added FK constraints from itinerary_services, expenses,
booking_supplier_status, supplier_invoices to suppliers — making the
referential link real but NOT solving the multi-tenancy of the suppliers
table itself. That work belongs here:

- [ ] `ALTER TABLE suppliers ADD COLUMN org_id UUID REFERENCES organizations(id)`,
      backfill from a per-org resolver (same mechanism as threads/briefs)
- [ ] RLS on suppliers with `user_is_in_org(org_id)` predicate
- [ ] All write-paths in `app/api/suppliers/*` and `app/api/rates/*` stamp
      org_id from session
- [ ] All read-paths (suppliers UI, rate dropdowns, sync-suppliers) scope by
      `org_id`. Note that several rate routes already use service-role; those
      need an explicit `.eq('org_id', orgId)` added since RLS won't filter for
      them
- [ ] `accommodation_rates`, `transportation_rates`, `nile_cruises`,
      `guide_rates`, `activity_rates`, `meal_rates` all carry supplier_id but
      no org_id — they inherit org-scoping transitively via the FK to
      suppliers. Decide whether to denormalize org_id onto rate rows for
      faster filtering vs always joining through suppliers
- [ ] End-to-end test: two orgs each have their own suppliers + rates;
      neither sees the other's

---

## G2. Guides registry and entrance-fee attractions — supplier model edges

**Status (2026-06-27, operator decisions):**
- **G2.2 entrance-fee attractions → ✅ DONE.** Decision: link to authority suppliers.
  entrance_fees already all carry `supplier_id` → *Supreme Council of Antiquities* (79/79).
  The gap was the entrance SERVICE rows (land `service-creation.ts`, cruise
  `cruise-service-creation.ts`, and `pricing-grid/save`) writing supplier_id=NULL.
  All three now stamp the matched fee's authority supplier_id (null only if just
  activity-rate fallbacks matched). Verified against real attractions; FK-valid.
- **G2.1 guides → suppliers MERGE: ✅ DONE 2026-06-27.** Operator confirmed the 23
  suppliers(type='guide') are canonical; the dirty 34-row guides table was discarded.
  Phase 1 `20260627_suppliers_guide_fields.sql` added 11 guide columns to suppliers
  (tier/daily_rate/hourly_rate/is_preferred/max_group_size/specialties + 6 rich fields).
  Phase 2 backfilled the 13 id-matched guides onto their supplier (all 23 now have
  languages; rates stay sparse — 3/23 daily_rate, as before; operator fills going forward).
  Phase 3+4 `20260627_guides_compat_view.sql` renamed guides→_deprecated_guides and made
  `guides` a VIEW over suppliers(type='guide') with INSTEAD-OF triggers — chosen over a
  19-site code repoint to avoid risk to the live pricing engine (no test suite). ZERO app
  code changed; all reads/writes resolve to suppliers via the view. Verified: 23-row reads,
  AI language/tier selection, insert/update/delete round-trip through the triggers.
  `_deprecated_guides` (34 rows) kept for rollback. Follow-up option: repoint reads to
  suppliers directly and drop the view.

**Status (original):** Open question — deliberately deferred from Phase 3 step 1/2.
**Trigger:** Answer before any normalization work that touches these surfaces.
**Owner:** Product / data modeling.
**Related code:** `lib/ai/cruise-service-creation.ts` (the
`guides`-table fallback), `lib/ai/service-creation.ts` (`selectedGuide` path
2), `app/api/resources/attractions/route.ts`, `entrance_fees` table.

Two edges of the supplier model remained unresolved when Phase 3 step 1
shipped the supplier_id wiring:

1. **`guides` table** — a SEPARATE 34-row registry of individual guides
   with `id`, `name`, `tier`, `languages`, `daily_rate`, etc. NOT a view of
   `suppliers`. No `supplier_id` column. The land + cruise service-creation
   pipelines fall back to this when `guide_rates` doesn't match (tier or
   language miss). Service rows written through that fallback have
   `supplier_id = NULL` by design today — but is that the *correct* design?
   Question: is the `guides` registry one of:
   - (a) a separate model entirely (independent contractors not classified
     as suppliers — needs its own FK column on itinerary_services and
     normalization story), or
   - (b) a denormalized cache that should be merged INTO `suppliers` with
     `type='guide'` (consolidating to one canonical supplier table)?

2. **Entrance-fee attractions** — entrance_fees rows reference Egyptian
   sites (Giza Plateau, Valley of Kings, etc.). The current code base
   treats them as "not suppliers in the canonical sense" and writes
   `supplier_id = NULL` on entrance service rows. But there is a real
   payable entity behind each — the Ministry of Tourism / Supreme Council
   of Antiquities — and an open question whether to model that:
   - (a) as a single supplier per government body, with attraction_name as
     a service-level descriptor, or
   - (b) as ad-hoc rows that stay un-suppliered (today's behavior), or
   - (c) as their own table (`attraction_authorities`?) with a separate FK

These aren't blocking. The Phase 3 FKs accept NULL for legitimately
supplier-less rows, so today's behavior is consistent. Recording so it
gets answered deliberately when the supplier model goes through another
pass, not rediscovered later.

---

## G3. suppliers.entity_kind sweep — 101 rows unclassified

**Status:** ✅ DONE 2026-06-27 (migration `20260627_entity_kind_sweep.sql`). All 111
suppliers classified (individual=31, company=80, 0 NULL). Rules: restaurant/cruise/
hotel/shop/activity_provider/attraction → company; guide → individual; transport →
name-based (bare personal names Ayman/Emad/Mohamed/Yosri → individual, else company).
entity_kind remains nullable by design. Original deferral notes below for history.

**Status (original):** Deferred — column shipped, populated for 7 suppliers only.
**Trigger:** Before any code or constraint that treats `entity_kind` as required.
**Owner:** Operator (per-row classification call).
**Related schema:** `migrations/20260628_supplier_vocab.sql` added the column with
`CHECK (entity_kind IS NULL OR entity_kind IN ('individual', 'company'))`.

Phase 3's vocabulary migration added `suppliers.entity_kind`. The
classification grid was confirmed only for the 7 suppliers actually
linked from `transportation_rates`. The remaining 101 suppliers all
have `entity_kind = NULL`.

**Current distribution (post-Phase-3):**
- `individual`: 4 (Sayed, Gerges Ibrahim, Abdulrahman, Mina William)
- `company`: 3 (Karnak Travel, Arkan Tours, Nile Valley Transport)
- `NULL`: 101 (everything else — hotels, guides, restaurants, cruises, etc.)

This is intentional: NULL means "not yet classified," and the column is
explicitly nullable. The CHECK constraint only validates non-NULL values.

### What ships when the gate trips

- [ ] One-time classification sweep of the 101 NULL rows. Most are obvious
      from `type`: hotels, cruises, restaurants are virtually always
      `company`; named guides are usually `individual`. A handful in the
      middle (boutique tour operators, family-run hotels) need a judgment
      call per row.
- [ ] **DO NOT** add `entity_kind NOT NULL` until the sweep completes —
      it would block any new supplier creation against the current UI
      until a default is picked, and there's no defensible business
      default (a guess between `individual`/`company` is wrong for the
      other case).
- [ ] If/when `entity_kind` becomes load-bearing for billing, tax
      reporting, or contract template selection, that's the trigger to
      complete the sweep AND tighten the constraint.

### Why this isn't built now

The 7 we classified are exactly the ones whose `entity_kind` actually
mattered for Phase 3 (they got the type-rename + FK backfill in the same
pass). Classifying the other 101 is bulk operator work with no
downstream consumer today — premature without a use case.
