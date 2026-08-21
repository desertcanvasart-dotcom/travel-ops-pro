# Plan — Multi-traveller data collection in the customer portal

**Status:** design agreed, not yet built.
**Decision owner:** operator (Islam).
**Author:** drafted 2026-08-21.

## 1. The problem

A booking is one itinerary for N travellers. Today the customer portal
(`/portal/[token]`) collects everyone's details behind **one link and one
gate**, and the gate verifies against the **lead** traveller's family name. So
whoever opens the link is treated as the lead and can see and edit **every**
traveller's data — passport, DOB, medical conditions, insurance form.

- For a **family**, that is fine and even convenient: the lead fills everyone in.
- For **friends**, it is wrong: friend B may not want the lead (or the others)
  to see or enter B's passport and medical details, and the lead should not be
  the person collecting everyone's documents.

## 2. The agreed design

One booking, one itinerary, N `booking_passengers` rows — **the record is
identical either way**. A per-booking **mode** decides access only.

### Family mode (default)
- One booking-level link (the lead's). Lead fills every traveller's details.
- Lead may add people; increasing the count past what was booked is a
  **re-price request to the operator**, not a silent change (see §7).

### Friends mode
- Booking still created for N on the same itinerary.
- The **lead supplies each traveller's name + date of birth + contact**
  (email/phone) in a small coordinator view on the lead's own link. DOB is
  required because it is the second factor of that traveller's gate (§5).
- The system mints **one private link per traveller**. Each link opens **only
  that traveller's own form** plus a non-personal shared trip view.
- A friend's personal data is **invisible to the lead and to the other
  friends**. The operator sees everything (service-role read, unchanged).
- The lead is also one of the N: they get their own private traveller link,
  and because they are the lead their link additionally carries the
  coordinator panel (roster + status). No separate coordinator link needed.

### Status — visible to operator **and** lead
- A completion checklist: traveller names + submitted / not-submitted, **no
  data**. Lets either chase the quiet traveller without seeing entries.
- The count already exists: `toPortalBooking().outstandingDetails` in
  `lib/booking-portal.ts` and per-traveller `submittedAt`.

### Out of scope for v1
- **Mixed groups** (e.g. a couple who share + two friends who don't). Strict
  family-or-friends per booking. Revisit only if these turn out common.

## 3. What already exists (reuse, don't rebuild)

| Piece | Where | Note |
|---|---|---|
| `booking_passengers` | migration + table | Already one row per traveller with all needed fields incl. `date_of_birth`, `is_lead_passenger`, insurance/申込書 fields. |
| Portal links | `booking_portal_links` (token, booking_id, org_id, revoked_at, expires_at, details_locked_at, view_count) | One per booking today. **No passenger scoping yet.** |
| Token mint / validate | `lib/booking-portal.ts` — `generatePortalToken`, `isValidPortalToken` | base64url of 24 random bytes. |
| Gate | `app/api/portal/[token]/verify/route.ts` + `verifyAnswerMatches` | HMAC cookie per token; uniform failures; rate-limited. **Hard-keyed to the lead.** |
| Portal page | `app/portal/[token]/page.tsx` | Loads the link, then **all** passengers, renders a `TravellerForm` each. |
| Per-traveller form | `app/portal/[token]/TravellerForm.tsx` | Collapsible, tracks its own `submittedAt`. |
| Write route | `app/api/portal/[token]/travellers/[id]/route.ts` | Updates one passenger. **Not scoped to a single passenger per token.** |
| Writable-field allow-list | `pickWritableFields` in `lib/booking-portal.ts` | Keep — a per-passenger token still only writes allowed fields. |
| Pax on booking | `bookings.num_adults`, `num_children` | Basis for the re-price guard. |

## 4. Data model changes

Two columns, one index. Migration is procedural-free, so a plain `ALTER`.

```sql
-- Which traveller a link is scoped to. NULL = booking-level link:
--   family mode's single link, and (in friends mode) the lead's coordinator
--   link is their own per-passenger link, so NULL is only used by family.
ALTER TABLE public.booking_portal_links
  ADD COLUMN passenger_id UUID NULL
    REFERENCES public.booking_passengers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_portal_links_passenger
  ON public.booking_portal_links(booking_id, passenger_id);

-- How the booking collects details. Set by the operator at booking time.
ALTER TABLE public.bookings
  ADD COLUMN portal_mode TEXT NOT NULL DEFAULT 'family'
    CHECK (portal_mode IN ('family', 'friends'));
```

`booking_passengers.date_of_birth` already exists — no change needed for the
gate. Per-traveller submitted state already exists (drives `submittedAt`).

**Invariant:** a per-passenger link has `passenger_id` set and
`passenger.booking_id = link.booking_id`. Enforced in code at mint and read.

## 5. The gate (name + DOB for per-passenger links)

`verify/route.ts` and `verifyAnswerMatches` branch on `link.passenger_id`:

- **Booking-level link (family, `passenger_id` NULL):** unchanged — booking
  number or the lead's family name, as today.
- **Per-passenger link (friends, `passenger_id` set):** verify against **that
  passenger's** family name **and** date of birth. Both required. Extend
  `verifyAnswerMatches` to accept `dob` and, in this branch, require a
  name-match **and** a DOB-match (not "any 2 tokens").

Why name + DOB: a per-person link unlocks one specific passport, a higher stake
than the booking view. A forwarded link is then useless without knowing the
person's DOB.

**Consequence to accept:** because DOB is the gate secret, the **lead must know
and seed each friend's DOB** when sending their link. That is a mild extension
of "the lead sends contacts." If that proves too much in practice, the
fallback is name-only for per-passenger links — a one-line relaxation, no
structural change.

Cookie isolation is automatic: the verify cookie is already an HMAC **per
token** (`portalVerifyCookieName(token)`), so verifying one friend's link never
unlocks another's.

## 6. Access enforcement (the privacy crux)

Both the **read** (page loader) and the **write** (travellers route) must scope
to the link, not the booking:

- **Page loader (`page.tsx`):**
  - `passenger_id` NULL → load all passengers (family: lead fills all).
  - `passenger_id` set → load **only** that passenger; render one form + the
    shared trip view (itinerary, dates, meeting point — non-personal fields
    only). If that passenger `is_lead_passenger` **and** `portal_mode =
    'friends'`, also render the coordinator panel (§8) and the status checklist.
- **Write route (`travellers/[id]`):**
  - `passenger_id` set → the `[id]` in the URL **must equal**
    `link.passenger_id`, else 403. This is what stops a friend's token from
    writing (or by extension reading) another traveller.
  - `passenger_id` NULL → `[id]` must belong to `link.booking_id` (today's
    check).
  - Keep `pickWritableFields` in both branches.

**Never** render one traveller's personal data under another traveller's token
or in the lead's coordinator view — the coordinator sees status only.

## 7. Pricing guard (applies to both modes)

Adding a traveller beyond the booked count changes the money.

- **Filling slots that already exist** (up to `num_adults + num_children`) —
  free, in-portal, no operator involvement.
- **Increasing the count** — a **change request** to the operator: create a
  pending record, notify the operator, do **not** auto-charge or auto-mint a
  link for the new person. The operator re-prices and confirms; only then is
  the slot (and, in friends mode, its link) created.

This keeps the customer from silently altering what they owe. It is the same
guard whether the lead adds a family member or a friend is added to the roster.

## 8. Lead coordinator view (friends mode)

On the lead's own private link, when `portal_mode = 'friends'`:

- **Roster entry:** for each traveller, name + DOB + contact (email or phone).
  Writes/updates the `booking_passengers` seed rows (name, DOB, contact only —
  not the private fields the friend will fill).
- **"Send private link"** per traveller → mint a per-passenger link and deliver
  it over the contact's channel using existing infra (`lib/email-send` for
  email; the LINE/WhatsApp path for messaging). Re-send / revoke supported via
  the existing `revoked_at`.
- **Status checklist:** who has submitted, no data.
- Adding a traveller here beyond booked count routes through §7.

The operator can also perform all of this from the booking page — the lead
coordinator view is a convenience mirror of operator capability, not a new
authority.

## 9. Operator side

- **Set `portal_mode`** (family | friends) when creating/editing the booking.
- **Status checklist** on the booking page (names + submitted/not, no data —
  same projection the lead sees).
- **Approve pax-increase re-price requests** (§7).
- Sees **all** traveller data regardless of mode (service-role read).

## 10. Security & privacy invariants (must hold)

1. Per-passenger token verification never unlocks another link (per-token
   HMAC cookie — already true).
2. Read and write are both scoped to `link.passenger_id` when set.
3. A friend's personal fields are never serialized into a response for another
   traveller's token or the coordinator view.
4. Gate failures stay uniform and rate-limited (already true) — name+DOB must
   not become an oracle.
5. `booking_passengers` remains anon-unreadable (covered by the 2026-08-21 RLS
   lockdown); the portal reads only via service role behind the gate.
6. Adding a traveller cannot change the price without operator confirmation.

## 11. Build phases

1. **Schema + scoping core.** Migration (§4). Per-passenger mint. Gate
   name+DOB branch (§5). Scoped read + write (§6). A friends-mode traveller can
   open their own link and fill only their form. *This is the privacy
   deliverable; everything else is convenience on top.*
2. **Coordinator view (§8).** Roster entry, send-link, status — on the lead's
   link and mirrored on the operator booking page.
3. **Re-price guard (§7).** Change-request record + operator approval + notify.
4. **Operator polish.** Mode toggle UI, status checklist on booking page.

Phases 1 and 4's status checklist can land first and are independently useful.

## 12. Testing

- **Unit:** `verifyAnswerMatches` with the name+DOB branch (right name/wrong
  DOB fails, right DOB/wrong name fails, both pass); write-scope authorization
  (per-passenger token rejects a foreign `[id]`); mode routing in the loader.
- **Migration:** run in PGlite before applying (per `pglite-migration-testing`
  memo) — verify the FK, the CHECK, and the default.
- **E2E (portal):** family link shows all forms; friends link shows exactly
  one; a forwarded friends link still requires that person's DOB; a friend's
  token cannot GET/PUT another traveller; status checklist shows counts, not
  data.

## 13. Open questions to confirm before Phase 1

1. **DOB seeding** (§5): confirmed choice is name+DOB, which means the lead
   seeds each friend's DOB. Accept, or fall back to name-only for per-passenger
   links?
2. **Shared trip view contents:** exactly which itinerary fields a per-passenger
   link may show (safe: dates, day-by-day plan, meeting point, hotel name;
   unsafe: other travellers' anything). Confirm the field list when building.
3. **Delivery channel per friend:** email vs LINE/WhatsApp is chosen by which
   contact the lead supplies — confirm both channels are acceptable for links.
4. **Edit-after-submit:** how a per-passenger link interacts with
   `details_locked_at` (the existing "answers frozen" flag) — lock per
   traveller, or per booking?
