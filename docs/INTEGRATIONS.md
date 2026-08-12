# Partner integrations

Two-way sync between this system and any external platform: they push their
departures to us, we serve them our availability calendar.

Nothing in the schema names a partner. A new platform is **one adapter file and
one row** — never a migration, never a change to a route.

---

## 1. Connect

An operator creates the connection (Settings → Integrations, or `POST
/api/integrations`):

```json
{ "provider": "generic", "name": "Acme Seat Pool", "direction": "both" }
```

`provider` selects the adapter that reads their payloads. `generic` is our own
documented shape below — start there. A platform only needs a dedicated adapter
if it cannot send it.

The response returns the credentials **and your webhook URL**:

```json
{
  "credentials": {
    "api_key": "tops_live_…",
    "inbound_secret": "whsec_…",
    "notice": "Copy these now — the API key is stored only as a hash…"
  },
  "webhook_url": "https://…/api/webhooks/integrations/ep_9fK2…"
}
```

The webhook URL carries a **per-connection token**. It identifies which
connection a delivery belongs to — it is not a credential, and can be shown
again at any time. Every connection gets its own, so revoking one partner's
endpoint (`PATCH … { "rotate_endpoint_token": true }`) leaves every other
partner untouched.

The API key is stored as a SHA-256 hash and is genuinely unrecoverable. Losing
it means rotating (`PATCH /api/integrations/{id}` with `rotate_api_key: true`),
which invalidates the old key **immediately** — there is no grace period,
because the usual reason to rotate is that the old key leaked.

---

## 2. Inbound — partner pushes departures to us

```
POST /api/webhooks/integrations/{endpoint_token}
x-tops-timestamp: <unix seconds>
x-tops-signature: sha256=<hex>
Content-Type:     application/json
```

Use the `webhook_url` handed to you at connection time. There is no tenant
header: the token in the path resolves the connection, and the organization
comes from our own record rather than from anything in your request.

### Signature

HMAC-SHA256 over `{timestamp}.{raw body}` using `inbound_secret`, hex-encoded.

```js
const signed = `${timestamp}.${rawBody}`
const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(signed).digest('hex')
```

Sign the **exact bytes** you send. `JSON.stringify(JSON.parse(body))` reorders
keys and produces a different digest.

The timestamp is part of the signed payload, so a captured delivery cannot be
replayed with a fresh one. Signatures older than **5 minutes** are refused.
Omitting the timestamp header signs the bare body — accepted, but replayable.

### Body — the canonical shape

```json
{
  "event_id": "evt_2026_08_12_001",
  "event_type": "departures.sync",
  "departures": [
    {
      "external_id": "DEP-9001",
      "tour_name": "Nile Cruise 8D",
      "tour_code": "NILE8",
      "start_date": "2026-11-02",
      "end_date": "2026-11-09",
      "duration_days": 8,
      "max_pax": 24,
      "booked_pax": 11,
      "min_pax": 4,
      "status": "open",
      "price_per_person": 1450.0,
      "currency": "EUR",
      "is_guaranteed": true,
      "cutoff_days": 3,
      "public_notes": "Guaranteed departure"
    }
  ]
}
```

Required per departure: `external_id`, `tour_name`, `start_date`, `max_pax`.

- **`external_id` must be stable.** It is the upsert key. An id that changes
  between syncs creates duplicates instead of updating.
- **`booked_pax` is seats SOLD, not seats remaining.** Getting this backwards
  makes a nearly-full departure read as nearly empty.
- `end_date` may be omitted if `duration_days` is present. Duration 1 means a
  same-day trip.
- `status` is derived from the seat counts when absent. We never infer
  `cancelled` or `guaranteed` — those are yours to declare.
- A bare `[…]` array, or `{ "data": […] }` / `{ "items": … }` / `{ "results": … }`,
  is accepted as well.

### Send `event_id`

It is your idempotency key. Retries are expected — a network timeout does not
tell you whether we applied the delivery. With an `event_id`, a retry returns
`{ "success": true, "duplicate": true }` and changes nothing. Without one, we
fall back to per-departure upserts, which is safe but does more work.

### Response

```json
{
  "success": true,
  "created": 3,
  "updated": 12,
  "unchanged": 40,
  "conflicts": [],
  "rejected": [{ "index": 7, "external_id": "DEP-77", "message": "missing tour_name" }]
}
```

`rejected` items were skipped; the rest of the batch still applied. **One bad
row never rejects the batch** — check this array rather than assuming a 200
means everything landed.

`conflicts` means we refused a departure because that `external_id` already
belongs to a locally-maintained departure or to a different integration. We will
not adopt a row the operator maintains: the next sync would overwrite their
edits.

### Status codes

| code | meaning |
|---|---|
| 200 | applied (check `rejected` / `conflicts`) |
| 400 | malformed body |
| 401 | signature missing, malformed, stale or wrong |
| 403 | connection disabled, or configured outbound-only |
| 404 | no such endpoint token |
| 413 | more than 2000 departures — page your sync |
| 500 | our fault; **retry with the same `event_id`** |

---

## 3. Outbound — partner reads our availability

```
GET /api/public/v1/availability?from=2026-11-01&to=2026-12-31
Authorization: Bearer tops_live_…
```

```json
{
  "success": true,
  "from": "2026-11-01",
  "to": "2026-12-31",
  "default_when_absent": "available",
  "days": [
    { "date": "2026-11-02", "status": "available", "available_slots": 2, "reason": null },
    { "date": "2026-12-25", "status": "blackout", "available_slots": 0, "reason": "Christmas" }
  ]
}
```

- `status` is one of `available`, `limited`, `busy`, `blackout`.
- **A date absent from `days` has no capacity entry, which means available** —
  not closed. `default_when_absent` says so explicitly so you do not have to
  guess.
- `available_slots` is `null` when the operator has set no group limit.
- Range is capped at 400 days. Defaults to today → +90 days.
- Cache for up to 60 seconds.

The response deliberately contains **no** internal notes, booked counts, client
names or prices. You need to know whether a date is open, not how the operator's
business is doing.

---

## 4. Adding a new platform

1. Write `lib/integrations/adapters/<slug>.ts` exporting an `IntegrationAdapter`.
   Translate their fields, then hand off to `normalizeDeparture` from
   `adapters/generic.ts` so validation lives in one place.
2. Register it in `lib/integrations/registry.ts`.
3. Create the connection with that `provider` slug. The webhook URL and
   credentials come back from that call.

Adapters are **pure** — no database, no network — so a partner's format can be
verified against a fixture without touching an environment. See
`adapters/sawa.ts`: it handles seats-remaining-instead-of-booked, nights instead
of days, and a private status vocabulary, which between them cover most of what
a real partner will throw at you.

An unknown `provider` falls back to the generic adapter rather than rejecting
live traffic, and the response says `adapter_fallback: true` so the fallback is
visible rather than silent.
