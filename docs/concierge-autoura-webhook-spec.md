# Autoura ⇐ Travel2Egypt AI Concierge — Inbound Brief Webhook Integration Contract

**Audience:** the concierge developer (building the sender) + the Autoura owner (must approve the receiver).
**Status of this document:** Specification + gap analysis written from a direct read of the Autoura codebase (`travel-ops-pro`, Next.js App Router + Supabase). Authored 2026-06-08.

> ## ✅ Status — v1 decisions locked and receiver implemented (2026-06-08)
>
> The original gap analysis found that **none of the receiving infrastructure existed** (no inbound brief webhook, no signature verification anywhere, no active rate limiting, no leads/briefs data model). The Autoura owner has since resolved every open decision and the receiver has been **built** in this PR. This document is now the implemented contract, not a proposal.
>
> **What was built** (branch `feat/concierge-brief-webhook`):
> - `app/api/webhooks/concierge/route.ts` — `POST` ingest + `GET` health/test-vector, with a dry-run mode.
> - `lib/concierge-webhook-auth.ts` — HMAC-SHA256 verification (Stripe-style header, dual-secret, replay window).
> - `lib/concierge-brief-schema.ts` — validation + field mapping (pure).
> - `lib/concierge-brief-intake.ts` — idempotent upsert + revision history + out-of-order guard.
> - `migrations/20260608_concierge_briefs.sql` — `concierge_briefs` + `concierge_brief_revisions`.
> - `middleware.ts` — `/api/webhooks/` allowlist (skips the auth round-trip).
> - `scripts/concierge-webhook-sign.mjs` + `docs/concierge-integration/` — signing CLI, sample/invalid payloads, test vector.
>
> **Locked decisions** (owner: Islam Hussein):
> 1. Land in a new **`concierge_briefs`** table + upserted **`clients`** prospect (`status='prospect'`, `client_source='concierge'`). — §3
> 2. Signature header **`X-Autoura-Signature: t=<unix>,v1=<hex>`** + companion `X-Autoura-Timestamp`. — §2
> 3. **Dual-secret** rotation (`CONCIERGE_WEBHOOK_SECRET` + `CONCIERGE_WEBHOOK_SECRET_PREVIOUS`). — §2
> 4. **No bearer second layer** for v1 — HMAC is sufficient. **No IP allowlist** for v1. — §1/§2
> 5. Contact rule: **email OR phone**; neither → store + flag `unactionable_no_contact` (not rejected). — §3c
> 6. Revisions: **Scenario A** (update-in-place + history), **out-of-order guard**, and a material revision **re-opens** the lead to `needs_review`. — §5
> 7. Idempotency on **`(conversation_id, brief_revision)`**; replays resolve to `200 duplicate_ignored`. — §6
> 8. **No durable rate limiting** in v1 — rely on Vercel platform protection for the single concierge source (flagged honestly). — §7
> 9. **`X-Request-Id`** per HTTP attempt, logged by Autoura. — §8
> 10. Staging = a **dedicated staging Vercel project** (not preview deploys). — §1/§9
>
> **Still pending — one item, from the concierge side:** the exact `comfort_level` vocabulary the v4.1 prompt emits (`briefExtraction.ts`), to finalize the `comfort_level → preferred_tier` map. Provisional default in use: `luxury→luxury, comfort→deluxe, standard→standard, budget→budget` (with keyword fallback). — §3b
>
> Tags below: **`FOUND`** = fact from the codebase · **`BUILT`** = implemented in this PR · **`TBD — <owner>`** = still needs a human.

---

## 0. What exists in Autoura today (evidence base)

| Concern | Reality in code | Reference |
|---|---|---|
| Inbound webhooks | Two, both Twilio. No generic/inbound-lead webhook. | `app/api/whatsapp/webhook/route.ts`, `app/api/whatsapp/status-callback/route.ts` |
| Webhook auth | **None.** Twilio webhook reads `formData()` and trusts it; on *any* error it still returns `200` to suppress retries. No signature check. | `app/api/whatsapp/webhook/route.ts` |
| API auth model | Middleware lets **all** `/api/*` through: `// Allow all API routes (they handle their own auth)`. Routes use the Supabase **service-role key** and mostly self-check (or don't). | `middleware.ts` |
| Closest shared-secret pattern | Cron routes check `Authorization: Bearer ${CRON_SECRET}`. This is the only bearer-secret precedent. | `app/api/cron/send-reminders/route.ts:106`, `app/api/cron/task-reminders/route.ts:21` |
| Lead-ish data model | `clients` (status defaults `prospect`, `client_source` defaults `whatsapp`) + `client_preferences` + `client_notes`. | `app/api/clients/route.ts` |
| Unified intake model | `communication_threads` + `communication_inbox` (+ `communication_drafts`). Dedup via `UNIQUE(channel, source_message_id)`. `channel` is `CHECK IN ('whatsapp','email')`. | `migrations/20260410_communication_copilot.sql`, `lib/copilot-intake.ts` |
| Idempotency precedents | (a) `itineraries.idempotency_key` — client-supplied UUID, partial unique index, route returns existing on hit. (b) `communication_inbox UNIQUE(channel, source_message_id)`. | `migrations/20260226_add_idempotency_key.sql`, `app/api/ai/generate-itinerary/route.ts:142-156` |
| Rate limiting | `lib/rate-limit.ts` exists (api: 100/min, etc.) but **used by no route** and **in-memory only** (`// In-memory store (use Redis in production for multi-instance)`). | `lib/rate-limit.ts` |
| Response conventions | Create → `201 { success: true, data }`. Validation → `400 { success: false, error }`. Server → `500 { success: false, error }`. No `202`/`204`/`409` used anywhere. | `app/api/clients/route.ts` |
| Runtime | Node runtime (uses `crypto`, `setInterval`), so HMAC is available. If deployed on serverless, per-instance state (rate-limit Map) is unreliable. | `lib/rate-limit.ts`, `app/api/invitations/route.ts:103` |
| Brand/domain | Product brand is **Autoura** (`autoura.net` appears in docs/marketing). Actual deployment URL (`NEXT_PUBLIC_APP_URL`) is set in env but its value is not something I can read/confirm. | `app/(public)/docs/getting-started/page.tsx:21`, `.env.local` (key present, value not confirmable) |

---

## 1. The webhook endpoint

| Item | Answer |
|---|---|
| Production URL | **`PROPOSED`**: `POST https://<autoura-prod-domain>/api/webhooks/concierge`. The exact base domain is **`TBD — Autoura owner`** (brand is `autoura.net`, but the live deployment host bound to `NEXT_PUBLIC_APP_URL` must be confirmed; the concierge dev should not hardcode `autoura.net` until confirmed). The path `/api/webhooks/concierge` is a proposal — no `/api/webhooks/*` namespace exists yet. |
| Staging URL | **`TBD — Autoura owner`.** No staging environment is evidenced in the repo (single `.env.local`, no `vercel.json`, no env-per-stage config). If one exists it is not visible in code. **Recommendation:** stand up a staging deployment (or at minimum a feature-flagged staging path) before launch — see §9. |
| HTTP method | `POST`. A `GET` on the same path should return a health/identity JSON (matches the existing convention where `/api/whatsapp/webhook` `GET` returns a status object). **`PROPOSED`** |
| Rate-limited? | **Not today** (see §0). **`PROPOSED`**: wire a limit on this endpoint — see §7. |
| Origin / IP allowlist | **None today** — middleware accepts all origins for `/api/*`. An IP allowlist is **`TBD — Autoura owner`** and is *probably impractical*: it depends on the concierge having stable egress IPs and on Autoura's host supporting inbound IP filtering (hard on serverless without a WAF). **Recommendation:** rely on HMAC (§2) as the trust boundary, not IP. If the host is Vercel/managed, treat IP allowlisting as out of scope for v1 and say so. |

---

## 2. Authentication

**Confirmation:** Autoura does **not** currently verify any signature, so there is nothing to "accept" yet — but HMAC-SHA256 is the right choice and is what I recommend building. The scheme below is **`PROPOSED`** and needs the Autoura owner's sign-off, because it is net-new code.

| Item | Answer (`PROPOSED` unless noted) |
|---|---|
| Signing method | **HMAC-SHA256** — confirmed as the recommended method. |
| Header name | **`X-Autoura-Signature`** (consistent with the `X-Autoura-*` brand; no existing header to conflict with). |
| Signed content | **`timestamp + "." + rawRequestBody`** (Stripe-style), *not* body-only. Including a timestamp lets Autoura reject replays. The concierge must compute the signature over the **exact raw bytes** it sends (Autoura will read `await request.text()` *before* JSON-parsing — order matters in Next.js). |
| Companion timestamp header | **`X-Autoura-Timestamp`** = unix seconds. Autoura rejects if `abs(now - timestamp) > 300s` (5-min tolerance) → `401`. |
| Signature format | Lowercase **hex**, carried in a structured value: `X-Autoura-Signature: t=<unix>,v1=<hexdigest>`. (If you prefer a flat header, the fallback is `X-Autoura-Signature: sha256=<hexdigest>` over body-only — GitHub style — but then you lose replay protection. **Recommend the `t=,v1=` form.**) |
| Verification | Autoura recomputes `HMAC_SHA256(secret, "{t}.{rawBody}")` and compares with `crypto.timingSafeEqual`. **`PROPOSED` — to be built.** |
| Secret provisioning | **`TBD — Autoura owner`**, with a recommendation: **Autoura generates** the secret (32-byte random, hex) and shares it once via a secure channel; concierge stores it as `CONCIERGE_WEBHOOK_SECRET`-equivalent. There is **no rotation UI** in Autoura today, and building one is out of scope for v1. Rotation = env var swap, coordinated manually. **Recommendation:** support **two valid secrets simultaneously** (`CONCIERGE_WEBHOOK_SECRET` + `CONCIERGE_WEBHOOK_SECRET_PREVIOUS`) so rotation is zero-downtime; accept a request if it matches *either*. |
| Second auth layer | **Optional, recommended.** A static `Authorization: Bearer <token>` on top of HMAC is cheap and matches the existing `CRON_SECRET` bearer precedent. **`TBD — Autoura owner`** whether to require it. It adds little security over a correct HMAC, so "HMAC only" is an acceptable v1; I lean to adding the bearer because the codebase already has the pattern and it gives a fast pre-HMAC reject. |

---

## 3. Payload schema Autoura expects — and the transformation it needs

**There is no Autoura-side schema for this object today.** So the honest answer to "which fields match" is: **Autoura accepts none of this shape natively, because no receiver exists.** The useful answer is a mapping into Autoura's *existing* tables, which reveals that **the `clients` model can absorb only ~40% of the brief; the majority of fields have no column to live in.** That is the single biggest design consequence, and it drives the data-model recommendation below.

### 3a. Recommended landing model — `PROPOSED`

I recommend a **dedicated `concierge_briefs` table** that stores the full brief as structured columns + JSONB, **plus** an upsert of a lightweight `clients` row (status `prospect`, `client_source = 'concierge'`) so the brief is actionable in the existing CRM/inbox the team already uses. Rationale: the brief is richer than `clients`, is versioned (revisions), and carries a transcript — forcing it into `clients` would lose data. A dedicated table also gives clean idempotency and revision history (§5/§6).

The alternative — routing through `communication_inbox` — is viable but requires (a) extending the `channel` CHECK to include `'concierge'` and (b) stuffing structured data into a free-text `message_body`. **Final choice is `TBD — Autoura owner`; my recommendation is the dedicated table + prospect upsert.**

### 3b. Field-by-field mapping

Legend: ✅ has a home today · 🟡 partial / needs transform · ❌ no home in current schema (needs the new table or a new column)

| Concierge field | Autoura destination | Status | Transform / note |
|---|---|---|---|
| `session_id` (UUID) | `concierge_briefs.session_id` | ❌ new | Opaque; store as-is. Not currently anywhere. |
| `conversation_id` (UUID) | `concierge_briefs.conversation_id` | ❌ new | **Idempotency/revision key** (§5/§6). Unique per conversation. |
| `submitted_at` (ISO 8601) | `concierge_briefs.submitted_at` | ❌ new | Maps cleanly to `timestamptz`. |
| `prompt_version` ("v4.1") | `concierge_briefs.prompt_version` | ❌ new | Store for audit. |
| `language` ("en"/"es") | `clients.preferred_language` (🟡) + `concierge_briefs.language` | 🟡 | `clients.preferred_language` is a free-text label (e.g. "English"); map `en→"English"`, `es→"Spanish"`. Keep raw code in the brief table. |
| `brief_revision` (int) | `concierge_briefs.brief_revision` | ❌ new | Drives §5. |
| `is_update` (bool) | derived / `concierge_briefs.is_update` | ❌ new | Autoura can also derive this from "row already exists for `conversation_id`"; store it for clarity. |
| `visitor.name` | `clients.first_name` + `clients.last_name` | 🟡 | **Split required.** `clients` has separate `first_name`/`last_name`; concierge sends one `name`. Recommended split: first token → `first_name`, remainder → `last_name`; if only one token, copy it to both (the clients route already defaults `last_name` to `first_name`). Keep full `name` in the brief table. |
| `visitor.email` | `clients.email` | ✅ | Direct. **See mandatory-field note below.** |
| `visitor.phone` | `clients.phone` | ✅ | Direct. |
| `visitor.preferred_contact` | `concierge_briefs.preferred_contact` (+ note) | ❌ new | No column on `clients`. Surface in the brief + optionally a `client_notes` line. |
| `visitor.timezone` | `concierge_briefs.visitor_timezone` | ❌ new | No `clients` column. |
| `trip.travelers_count` | `concierge_briefs.travelers_count` | ❌ new | `clients` has no pax field (pax lives on `itineraries`, created later). |
| `trip.travelers_detail` | `concierge_briefs.travelers_detail` (JSONB/text) | ❌ new | Free-form; store verbatim. |
| `trip.dates_specific` | `concierge_briefs.dates_specific` | ❌ new | Store both forms. |
| `trip.dates_window` | `concierge_briefs.dates_window` | ❌ new | |
| `trip.trip_length_days` | `concierge_briefs.trip_length_days` | ❌ new | |
| `trip.origin_city` | `concierge_briefs.origin_city` | ❌ new | |
| `trip.nationality` | `clients.nationality` | ✅ | Direct (`clients.nationality` exists; defaults "Unknown"). Also drives `passport_type` indirectly — leave `passport_type` to default `'other'` unless you map it. |
| `trip.international_flights` | `concierge_briefs.international_flights` | ❌ new | |
| `preferences.destinations[]` | `concierge_briefs.destinations` (JSONB) | ❌ new | Array → JSONB. |
| `preferences.comfort_level` | `client_preferences.preferred_tier` (🟡) | 🟡 | `preferred_tier` expects values like `standard`/`deluxe`/`luxury`; map the concierge's comfort_level vocabulary onto that enum (**value mapping `TBD` once concierge enumerates its comfort_level values**). |
| `preferences.interests[]` | `client_preferences.interests` (🟡 text) | 🟡 | `client_preferences.interests` is a single text field → join array with `", "`. Keep the array in the brief table. |
| `preferences.must_see[]` | `concierge_briefs.must_see` (JSONB) | ❌ new | |
| `preferences.must_avoid[]` | `concierge_briefs.must_avoid` (JSONB) | ❌ new | |
| `constraints.dietary` | `client_preferences.special_needs` (🟡 merged) + brief | 🟡 | `client_preferences` has a single `special_needs` free-text field; concatenate the four constraints into it for CRM visibility, and store them structured in the brief table. |
| `constraints.mobility` | same as above | 🟡 | |
| `constraints.religious` | same as above | 🟡 | |
| `constraints.medical` | same as above | 🟡 | ⚠️ Medical data is sensitive — see privacy note in §11. |
| `brief_summary` (paragraph) | `client_notes.note_text` (✅) + `concierge_briefs.brief_summary` | ✅ | Insert as a `client_notes` row (`note_type: 'general'`, `is_internal: true`) so it shows in the client record, and keep canonical copy in the brief. |
| `full_transcript` (array) | `concierge_briefs.full_transcript` (JSONB) | ❌ new | No home in `clients`/`client_notes`. Must be JSONB on the new table (or a child table). Do **not** try to force into `communication_inbox.message_body`. |
| `follow_up_window.committed_response_by` | `concierge_briefs.committed_response_by` | ❌ new | Could also seed a Task/reminder (Autoura has a tasks + reminders system) — **`PROPOSED` enhancement**, not v1-required. |
| `follow_up_window.cairo_time_label` | `concierge_briefs.cairo_time_label` | ❌ new | Display string; store verbatim. |
| `follow_up_window.visitor_local_label` | `concierge_briefs.visitor_local_label` | ❌ new | Display string; store verbatim. |

### 3c. Mandatory-on-Autoura-side fields the concierge might not always have

- **At least one of `visitor.email` / `visitor.phone`** — without a contact method the "lead" is not actionable. `clients` itself allows both to be null, so Autoura *can* store an anonymous brief, but the team can't act on it. **Decision `TBD — Autoura owner`:** reject (`422`) a brief with neither email nor phone, or accept it as a contactless brief? **Recommendation:** accept + flag, don't reject (a contactless brief still has analytics value and the visitor may add contact info on a later revision).
- **`conversation_id`** — required by Autoura for idempotency/revisions. If the concierge ever omits it, Autoura cannot dedup or correlate revisions → treat as `422`.
- **`first_name`** — the *current* `clients` POST requires `first_name` (`400` otherwise). The brief upsert must always derive a `first_name` from `visitor.name` (fallback `"Concierge lead"` if name is absent).

### 3d. Fields Autoura wants that the concierge isn't sending

None are strictly required beyond the above. Two it would *populate by default* (not asks of the concierge): `client_source = 'concierge'` (Autoura sets this constant) and `status = 'prospect'` (Autoura default). All other `clients` fields have safe defaults in the existing POST handler.

---

## 4. Response semantics — `PROPOSED` (must be built to match)

Modeled on Autoura's existing `clients` route conventions (`201 { success, data }`, `4xx { success:false, error }`).

| Outcome | Status | Body |
|---|---|---|
| New brief stored | `201` | `{ "success": true, "data": { "brief_id": "<uuid>", "conversation_id": "...", "status": "received", "record_url": "https://<domain>/clients/<id>" } }` |
| Revision applied to existing | `200` | same shape, `"status": "updated"` |
| Idempotent replay (same `conversation_id`+`brief_revision` already stored) | `200` | same shape, `"status": "duplicate_ignored"` — **not** an error |
| Malformed JSON / unparseable body | `400` | `{ "success": false, "error": "..." }` |
| Missing/invalid signature or expired timestamp | `401` | `{ "success": false, "error": "invalid signature" }` |
| Schema valid JSON but fails validation (e.g. no contact, missing `conversation_id`) | `422` | `{ "success": false, "error": "...", "field": "..." }` |
| Rate limited | `429` | `{ "success": false, "error": "...", "retryAfter": <s> }` + `Retry-After` header |
| Autoura-side failure (DB down, etc.) | `500` / `503` | `{ "success": false, "error": "..." }` |

- **Autoura-side ID to store back** in `concierge.briefs.autoura_webhook_response`: **yes** — return `data.brief_id` (and `record_url`). Store the whole JSON response.
- **Retry policy confirmation:** **`5xx` and `429` → retry; `4xx` (400/401/422) → do not retry.** One nuance: a `409` is intentionally **not** used here — duplicates resolve to an idempotent `200`, so the concierge's retry logic never has to special-case 409. (If the owner insists on hard-rejecting duplicates with `409`, treat `409` as do-not-retry.)

---

## 5. Revision handling — recommendation is definitive, build is required

**Recommended behavior = your Scenario A**, and it requires building. `PROPOSED`:

- On a brief whose `conversation_id` already exists, Autoura **updates the existing `concierge_briefs` row in place** (it becomes the current record), and **appends the prior version** to a `concierge_brief_revisions` history (child table or JSONB array). The linked `clients` prospect is updated, not duplicated. The team sees **one current record with visible change history** — exactly Scenario A.
- This depends on the data-model decision in §3a. It is straightforward with the dedicated table; it is messy via `communication_inbox` (each revision would be a new inbox row → drifts toward Scenario B).
- **Out-of-order guard:** if a brief arrives with `brief_revision` ≤ the stored revision (a late/replayed older revision), Autoura keeps the higher revision as current and files the older one into history without overwriting. `PROPOSED`.

**Definitive answer for the Travel2Egypt team's workflow:** Scenario A, *contingent on Autoura building the dedicated brief table + revision history.* Until that is built, no revision behavior exists at all. The Autoura owner must commit to building this for the answer to remain "A."

---

## 6. Idempotency

Autoura has clean precedents to copy (`itineraries.idempotency_key`; `communication_inbox UNIQUE(channel, source_message_id)`), but nothing for briefs yet. `PROPOSED`:

- **Primary dedup key:** `UNIQUE(conversation_id, brief_revision)` on `concierge_briefs`. The same brief sent twice (network retry, deploy mid-flight) hits the unique constraint → Autoura returns the stored record with `200 "duplicate_ignored"` (it does **not** create a duplicate and does **not** error).
- **Optional explicit key:** also accept an `Idempotency-Key` header (UUID). If you'd rather not rely on `conversation_id`+`brief_revision`, send `Idempotency-Key` and Autoura will dedup on that instead. Header name: **`Idempotency-Key`**, format: UUID v4 string. **`TBD — Autoura owner`** whether to honor the header in v1; the `(conversation_id, brief_revision)` constraint alone is sufficient and is what I recommend shipping.
- **Accidental double-send result:** accepted-but-ignored (idempotent `200`), never a duplicate, never a hard error.

---

## 7. Rate limits and throttling

- **Today:** none active (see §0). `lib/rate-limit.ts` is unused and in-memory.
- **`PROPOSED`:** apply a per-source limit on the endpoint. Suggested threshold **60 requests/minute** per signing identity (briefs are inherently low-volume; this is generous headroom). Final number **`TBD — Autoura owner`**.
- **On limit hit:** `429` with `Retry-After` and `X-RateLimit-*` headers (the existing `rateLimitResponse` helper already emits these — reuse it). Concierge should honor `Retry-After`.
- **Sustained-spike risk — real, surface it:** the existing limiter's in-memory `Map` + `setInterval` cleanup **do not work reliably on serverless/multi-instance** (each instance has its own counter and timer). If Autoura is on Vercel or similar, a launch-day spike could (a) bypass the limiter unevenly and (b) hammer the Supabase service-role path (every brief does several writes: `clients` upsert + `client_preferences` + `client_notes` + the brief). **Recommendation before launch:** move rate limiting to a shared store (Upstash/Redis) **or** accept that v1 has best-effort limiting only, and load-test the brief write path against Supabase connection limits. This is a genuine pre-launch gap, not a theoretical one.

---

## 8. Webhook delivery guarantees

- **Dedup on concierge-retry-after-successful-receipt:** **yes, once §6 is built.** If Autoura received and stored the brief but the `200` didn't reach the concierge, the concierge's retry hits the `(conversation_id, brief_revision)` unique constraint and gets an idempotent `200` — no duplicate. This is the main reason to build idempotency, not just nice-to-have.
- **Receipt confirmation beyond HTTP 200:** **none today, and none planned for v1.** There is no callback/event-log/webhook-receipt mechanism. The HTTP `200`/`201` *is* the confirmation. A return callback to the concierge is a **v2** item (§11).
- **To make Autoura's debugging easier (do these in v1):**
  - Send a stable correlation ID — reuse `conversation_id` (and include `session_id`, `brief_revision`) so Autoura can log/grep by it. Autoura should log these on every receipt. `PROPOSED`.
  - Send an `X-Request-Id` (UUID per HTTP attempt, changes on retry) so a *single delivery attempt* is traceable end-to-end and distinguishable from a retry of the same brief. **`PROPOSED` header**, format UUID.
  - Keep the JSON shape exactly as the agreed schema; Autoura should reject (and log) unknown top-level keys only as warnings, not failures.

---

## 9. Local development and testing

- **Sandbox/staging:** **`TBD — Autoura owner`** — none evidenced (see §1). **Recommendation:** a staging deployment with its **own** signing secret so the concierge can test without touching prod data. Until that exists, the concierge can run Autoura locally (`next dev`, port 3000) and tunnel via ngrok — exactly how the Twilio webhook is documented to be tested (`app/api/whatsapp/webhook/route.ts` setup comments).
- **Sample valid payload (for the concierge to test against):** Autoura should publish a canonical example once the schema is frozen. A starter, derived from §3:
  ```json
  {
    "session_id": "8f1c...","conversation_id": "b2e9...","submitted_at": "2026-06-08T14:03:00Z",
    "prompt_version": "v4.1","language": "en","brief_revision": 1,"is_update": false,
    "visitor": { "name": "Jane Doe","email": "jane@example.com","phone": "+15551234567","preferred_contact": "email","timezone": "America/New_York" },
    "trip": { "travelers_count": 2,"travelers_detail": "2 adults, honeymoon","dates_specific": null,"dates_window": "Oct 2026, ~10 days","trip_length_days": 10,"origin_city": "New York","nationality": "American","international_flights": true },
    "preferences": { "destinations": ["Cairo","Luxor","Aswan"],"comfort_level": "deluxe","interests": ["history","food"],"must_see": ["Abu Simbel"],"must_avoid": ["crowded markets"] },
    "constraints": { "dietary": "vegetarian","mobility": null,"religious": null,"medical": null },
    "brief_summary": "Jane and her partner want a 10-day deluxe history-and-food honeymoon...",
    "full_transcript": [ { "role": "assistant","content": "Hi! ...","timestamp": "2026-06-08T13:50:00Z" } ],
    "follow_up_window": { "committed_response_by": "2026-06-09T09:00:00Z","cairo_time_label": "9:00 AM Cairo","visitor_local_label": "2:00 AM EDT" }
  }
  ```
- **Sample invalid payloads + expected errors (for error-handling tests):**
  - Bad signature / wrong secret → `401`.
  - `X-Autoura-Timestamp` older than 5 min → `401`.
  - Body not JSON → `400`.
  - Missing `conversation_id` → `422 {field:"conversation_id"}`.
  - Neither email nor phone → `422` (if owner chooses reject) **or** `201` with a "contactless" flag (if accept). **This branch depends on the §3c decision.**
  - Duplicate `(conversation_id, brief_revision)` → `200 "duplicate_ignored"`.
- **End-to-end HMAC verification before prod:** Autoura should ship a tiny verify utility/endpoint on staging (e.g. `GET /api/webhooks/concierge` returns the expected canonicalization recipe, and a documented test vector: given a fixed secret + body + timestamp, the expected hex digest). The concierge can assert its signer reproduces that digest. `PROPOSED`.

---

## 10. Operational concerns

| Item | Answer |
|---|---|
| Integration owner (name + contact) | **Resolved.** v1 owner is **Islam Hussein** — WhatsApp **+20 115 801 1600**, email **islam@travel2egypt.org**. The concierge team escalates delivery issues to him directly. |
| SLA / uptime / maintenance windows | **Resolved: best-effort, no formal SLA, no scheduled maintenance windows.** The concierge's email fallback should treat Autoura as "probably available, expect occasional outages." Documented honestly rather than claiming an SLA we can't back. |
| Notification on concierge go-live / disable / failure | **Resolved (process):** the concierge notifies Islam (contact above) on go-live, kill-switch, and sustained-failure/fallback-to-email events; Autoura notifies the concierge before any deploy/maintenance expected to drop deliveries. |

---

## 11. Future-state (v2) roadmap — not for v1

- **Status callbacks (bidirectional):** Autoura calls back to the concierge when a brief is *acted on* (assigned, quoted, won/lost), so the concierge can update `concierge.briefs` and tell the visitor "an expert is on it." This is the highest-value v2 item; it closes the loop §8 leaves open.
- **Structured trip-outcome tracking:** link a brief → `itinerary` → `booking` (Autoura already has all three models) and emit outcome events, enabling concierge-attributed conversion analytics.
- **Richer receipt:** an event log / signed delivery receipt endpoint so the concierge can reconcile deliveries beyond a bare `200`.
- **Secret-rotation UI + per-partner secrets:** today rotation is a manual env swap (§2). A small admin UI issuing/rotating per-source secrets would scale to more inbound partners.
- **Distributed rate limiting + WAF/IP allowlist:** promote the in-memory limiter to Redis and revisit IP allowlisting once egress IPs are known (§7/§1).
- **PII/medical handling:** `constraints.medical` is sensitive. v2 should define retention, encryption-at-rest expectations, and whether medical/dietary constraints should be redacted from transcripts stored long-term. Flag now so it's a conscious choice, not an accident.
- **Task/reminder auto-creation:** turn `follow_up_window.committed_response_by` into a real Autoura Task/reminder (the system exists) so the SLA is enforced in-app, not just stored.

---

## Build gaps that MUST close before this integration can ship

These are not optional polish — without them there is nothing to integrate against:

1. **Create the inbound endpoint** `POST /api/webhooks/concierge` (+ `GET` health). *(none exists)*
2. **Build HMAC-SHA256 verification** (raw-body read, timestamp tolerance, `timingSafeEqual`, dual-secret support). *(no signature code exists anywhere)*
3. **Decide + build the data model** — recommended: `concierge_briefs` table (+ JSONB columns + `concierge_brief_revisions`) and a `clients` prospect upsert. *(no leads/briefs table exists)*
4. **Build idempotency** — `UNIQUE(conversation_id, brief_revision)` + idempotent `200` on replay. *(precedents exist; not wired for briefs)*
5. **Build revision handling (Scenario A)** — in-place update + history. *(does not exist)*
6. **Wire + harden rate limiting** for the endpoint, ideally distributed. *(utility exists, unused, in-memory)*
7. **Extend `channel` CHECK** *iff* routing through `communication_inbox` instead of a dedicated table (`'whatsapp','email'` → add `'concierge'`). *(only if §3a goes that way)*
8. **Stand up staging + a secret + a test vector** for end-to-end HMAC testing. *(no staging evidenced)*

---

## Open items — status

All Autoura-side decisions are now **resolved** (see the status box at the top). What remains:

| Item | Status |
|---|---|
| Data-model decision | ✅ Resolved — `concierge_briefs` + `clients` prospect. **Built.** |
| Signature scheme / dual-secret | ✅ Resolved. **Built.** |
| Bearer layer / `Idempotency-Key` header / IP allowlist | ✅ Resolved — none required for v1 (HMAC sufficient). |
| Contactless-brief policy | ✅ Resolved — accept + flag `unactionable_no_contact`. **Built.** |
| Rate limiting | ✅ Resolved — no durable limiting in v1; rely on Vercel platform protection (flagged in §7 and in the route). |
| Integration owner / SLA / notifications | ✅ Resolved — Islam Hussein; best-effort, no formal SLA. |
| **Production base domain** (`NEXT_PUBLIC_APP_URL`) | ⏳ **Operational** — set when prod deploy is confirmed; not a code blocker. |
| **Dedicated staging Vercel project** | ⏳ **Operational** — to be provisioned; URL + secret shared out-of-band. |
| **Secret value** | ⏳ **Operational** — Autoura generates a 32-byte random secret, shares out-of-band; concierge sets `CONCIERGE_WEBHOOK_SECRET`. |
| **`comfort_level` vocabulary** (concierge side) | ⏳ **Pending concierge** — enumerate from `briefExtraction.ts`; provisional four-tier map in use until then. |

The four remaining items are operational/out-of-band (provision staging, generate the secret, confirm the prod domain) or owned by the concierge (comfort_level vocabulary) — none block merging the receiver.
