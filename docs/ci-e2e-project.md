# The CI Supabase project

The E2E smoke suite needs a real Postgres to run against. It used to use the
**production** project, which meant two things:

- every pull request created and deleted rows in the live customer database
- CI held a **service-role key** — which bypasses RLS — and this repository is
  **public**, so anyone with write access could read that key out of a workflow
  they had modified

Fork PRs were never the exposure (GitHub withholds secrets from them). Write
access was, and the live-data writes happened on every run regardless.

So E2E now runs against a **dedicated throwaway project** that holds nothing but
fixtures. If it were deleted tomorrow the only cost is re-running this page.

---

## What you need to do once

Three steps. Only steps 1 and 3 need your Supabase account; step 2 is a single
command.

### 1. Create the project

In the Supabase dashboard: **New project**.

- **Name**: `travel-ops-pro-ci`
- **Region**: anything — pick the one nearest your CI runners
- **Database password**: generate a strong one and keep it for step 2

It does **not** have to live in the same organisation as production. A separate
org is arguably better: it means a mistake made here cannot reach production
billing, data, or keys.

### 2. Copy the schema across

The suite boots the whole app, so it needs the real schema — tables, triggers,
constraints and functions. `migrations/` cannot build this from scratch (114
incremental files that assume a pre-existing base), so copy it from production.

**This copies the schema only — no rows.** Both connection strings are on each
project's dashboard under **Project Settings → Database → Connection string
(URI)**.

```bash
# 1. Dump production's schema (structure only, no data)
supabase db dump \
  --db-url "postgresql://postgres:PROD_PASSWORD@db.PROD_REF.supabase.co:5432/postgres" \
  -f /tmp/e2e-schema.sql

# 2. Load it into the CI project
psql "postgresql://postgres:CI_PASSWORD@db.CI_REF.supabase.co:5432/postgres" \
  -f /tmp/e2e-schema.sql

# 3. Delete the dump — it describes your production schema
rm /tmp/e2e-schema.sql
```

Then seed the fixtures the suite expects:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://CI_REF.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="CI_SERVICE_ROLE_KEY" \
E2E_EMAIL="e2e-smoke@travelops.test" \
E2E_PASSWORD="<generate a new one>" \
npm run seed:e2e
```

`scripts/seed-e2e.mjs` creates the auth user, the `E2E Smoke Org` organisation
with an owner membership, and one seeded itinerary. It is idempotent.

### 3. Set the GitHub secrets

From the CI project's **Project Settings → API** page:

| Secret | Value |
| --- | --- |
| `E2E_SUPABASE_URL` | the CI project's URL |
| `E2E_SUPABASE_ANON_KEY` | the CI project's anon key |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | the CI project's service-role key |
| `E2E_EMAIL` | `e2e-smoke@travelops.test` |
| `E2E_PASSWORD` | the password you used when seeding |

```bash
gh secret set E2E_SUPABASE_URL              -R desertcanvasart-dotcom/travel-ops-pro
gh secret set E2E_SUPABASE_ANON_KEY         -R desertcanvasart-dotcom/travel-ops-pro
gh secret set E2E_SUPABASE_SERVICE_ROLE_KEY -R desertcanvasart-dotcom/travel-ops-pro
gh secret set E2E_EMAIL                     -R desertcanvasart-dotcom/travel-ops-pro
gh secret set E2E_PASSWORD                  -R desertcanvasart-dotcom/travel-ops-pro
```

### 4. Remove the production keys from CI, and rotate them

Once a PR has gone green against the new project, delete the old secrets — they
are no longer read by any workflow:

```bash
gh secret delete SUPABASE_SERVICE_ROLE_KEY  -R desertcanvasart-dotcom/travel-ops-pro
gh secret delete NEXT_PUBLIC_SUPABASE_URL   -R desertcanvasart-dotcom/travel-ops-pro
gh secret delete NEXT_PUBLIC_SUPABASE_ANON_KEY -R desertcanvasart-dotcom/travel-ops-pro
```

**Then rotate the production service-role key.** It has sat in CI on a public
repository, so treat it as exposed regardless of whether anyone read it:
Supabase dashboard → **Project Settings → API → service_role → Reset**. Update
Railway's environment variable in the same sitting, or production goes down.

---

## What happens before you finish this

The E2E job **fails loudly** with a message pointing here. That is deliberate.
The previous gate treated missing secrets as "fork PR, skip", so renaming a
secret would have turned E2E off on every pull request while CI still reported
green — a suite that silently stops running is worse than one that breaks.

Fork PRs still skip cleanly, because GitHub genuinely does withhold secrets
there. The gate now tells the two cases apart.

---

## Running the suite locally

The protection above covers CI. It used to stop there: `.env.local` holds the
PRODUCTION keys, nothing overrode them, and so `npm run test:e2e` on a laptop
wrote to real customer data. The specs write — one creates a hotel rate,
another a booking and a traveller — so this was a live hazard, not a
theoretical one.

`playwright.config.ts` now refuses to start unless it is handed a dedicated
project:

```bash
E2E_SUPABASE_URL=https://<ci-project>.supabase.co \
E2E_SUPABASE_ANON_KEY=... \
E2E_SUPABASE_SERVICE_ROLE_KEY=... \
E2E_EMAIL=... E2E_PASSWORD=... \
npm run test:e2e
```

Those three keys are applied to the tests **and** to the dev server Playwright
boots, so both halves talk to the same throwaway project. `E2E_EMAIL` and
`E2E_PASSWORD` must be a login that exists in THAT project — the production
one will not authenticate against it.

Put them in a `.env.e2e` you source, not in `.env.local`: `.env.local` is what
`next dev` reads, and pointing your own development server at the CI project is
not what you want.

To run against production deliberately — proving a deploy, which is a real and
occasional need — set `E2E_ALLOW_PRODUCTION=1`. The run prints a warning each
time, and it writes to live data.

---

## Keeping it working

The CI project's schema drifts as production's does. When a migration lands,
apply it to both — the E2E suite failing on a missing column is the symptom.

`__tests__/ci/workflow-secrets.test.ts` asserts no workflow ever reads a
production Supabase secret again, and that the gate keeps distinguishing a fork
from a misconfiguration.
