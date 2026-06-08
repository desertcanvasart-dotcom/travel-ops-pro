# Concierge → Autoura Brief Webhook — Integration Package

Everything the concierge developer needs to build and verify the sender. The
full contract is in [`../concierge-autoura-webhook-spec.md`](../concierge-autoura-webhook-spec.md);
this folder is the hands-on test kit.

## Endpoint

```
POST  {BASE_URL}/api/webhooks/concierge
GET   {BASE_URL}/api/webhooks/concierge      ← health + canonicalization recipe + live test vector
```

`BASE_URL` is provided out-of-band (staging first, then production). The secret
is provided out-of-band and set on the concierge as `CONCIERGE_WEBHOOK_SECRET`.

## Signing (HMAC-SHA256)

| Header | Value |
|---|---|
| `X-Autoura-Signature` | `t=<unix>,v1=<hexdigest>` |
| `X-Autoura-Timestamp` | `<unix>` (must equal the `t` inside the signature) |
| `X-Request-Id` | a **fresh UUID per HTTP attempt** (changes on retry; lets Autoura distinguish retries from new briefs) |
| `Content-Type` | `application/json` |

- **Signed content:** `` `${timestamp}.${rawBody}` `` — the timestamp, a literal dot, then the **exact raw bytes** you send. Sign the bytes you transmit; don't re-serialize after signing.
- **Digest:** HMAC-SHA256, lowercase hex.
- **Replay window:** Autoura rejects timestamps more than **300s** from its clock (`401`).
- **Rotation:** Autoura may run two valid secrets at once (`CONCIERGE_WEBHOOK_SECRET` + `..._PREVIOUS`). You only ever hold one; rotation is a coordinated swap.

Reference signer (Node): [`../../scripts/concierge-webhook-sign.mjs`](../../scripts/concierge-webhook-sign.mjs). The verifier Autoura runs is [`../../lib/concierge-webhook-auth.ts`](../../lib/concierge-webhook-auth.ts) — read `signConciergePayload` if porting to another language.

## Verify your signer before sending real traffic

```bash
# 1. Reproduce the published fixed test vector locally:
node scripts/concierge-webhook-sign.mjs --verify-test-vector
#    -> t=1735732800,v1=3cc2e7aba5b04ecf03020484f1befcdb128b1cb83f38030550591b159334db5a

# 2. Confirm Autoura agrees (same digest from the live endpoint):
curl -s {BASE_URL}/api/webhooks/concierge | jq .test_vector.expected_signature_header

# 3. Dry-run a real payload (verifies signature + previews the mapping, NO write):
node scripts/concierge-webhook-sign.mjs \
  --secret $CONCIERGE_WEBHOOK_SECRET \
  --url {BASE_URL}/api/webhooks/concierge \
  --payload docs/concierge-integration/sample-brief.json \
  --dry-run
```

`--dry-run` returns `signature.valid`, `validation.ok`, the `would` action, and the
full `mapping_preview` (the clients row, preferences, flags, and brief columns Autoura
would write) — without touching the database.

## Responses

| Outcome | Status | `data.status` |
|---|---|---|
| New brief stored | `201` | `received` |
| Revision applied (lead re-opened to `needs_review`) | `200` | `updated` |
| Older revision arrived late (filed to history, current kept) | `200` | `older_revision_filed` |
| Exact replay of an already-stored `(conversation_id, brief_revision)` | `200` | `duplicate_ignored` |
| Malformed JSON | `400` | — |
| Bad / missing / expired signature | `401` | — |
| Schema validation failed | `422` | — (see `errors[]`) |
| Autoura-side failure (safe to retry) | `500` | — |

Success body:
```json
{ "success": true, "data": {
  "brief_id": "…", "conversation_id": "…", "brief_revision": 1,
  "status": "received", "review_status": "needs_review",
  "client_id": "…", "record_url": "{BASE_URL}/clients/…" } }
```
Store `data` to `concierge.briefs.autoura_webhook_response`.

**Retry policy:** retry on `5xx` and `429`; do **not** retry on `4xx`. Duplicates are
never an error (they resolve to `200 duplicate_ignored`), so retries after a lost
response are safe and idempotent.

## Fixtures

| File | Sending it should yield |
|---|---|
| [`sample-brief.json`](sample-brief.json) | `201 received` (first send), `200 duplicate_ignored` (resend) |
| [`invalid-payloads/missing-conversation-id.json`](invalid-payloads/missing-conversation-id.json) | `422`, `field: "conversation_id"` |
| [`invalid-payloads/bad-revision.json`](invalid-payloads/bad-revision.json) | `422`, `field: "brief_revision"` |
| [`invalid-payloads/no-contact.json`](invalid-payloads/no-contact.json) | `201 received`, but `flags: ["unactionable_no_contact"]` — **accepted, not rejected** |
| [`invalid-payloads/not-json.txt`](invalid-payloads/not-json.txt) | `400` (after a valid signature over the raw text) |
| [`test-vector.json`](test-vector.json) | fixed signing test vector |

## Field mapping & open items

See spec §3 for the full field-by-field mapping. One item still pending **from the
concierge side**: the exact `comfort_level` vocabulary the v4.1 prompt emits (from
`briefExtraction.ts`), so the `comfort_level → preferred_tier` map can be finalized.
Until then Autoura uses the provisional default: `luxury→luxury, comfort→deluxe,
standard→standard, budget→budget` (with keyword fallback).
