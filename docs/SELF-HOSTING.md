# Running Autoura on your own server

Install, upgrade and diagnose. T2 of `docs/plans/self-hosting.md`.

**Read "Known limitations" at the bottom first.** A fresh install has never been
performed end to end, and there is one blocker that will affect every customer
email you send. Both are stated plainly rather than discovered later.

---

## Prerequisites

- **Node 20+**
- **A Supabase project.** You need its URL, anon key, service-role key, and — for
  migrations only — its Postgres connection string.
- API keys for the features you want. Only Supabase is strictly required;
  Anthropic is required for the AI features. Everything else disables itself
  cleanly when unset. `.env.example` says which is which.

## First install

```bash
git clone <this repo>          # at a release tag, once T5 exists
cd travel-ops-pro
npm ci
cp .env.example .env.local     # then fill it in
```

`.env.example` is the authority on configuration. It is generated from the code
rather than maintained by hand, and a test fails if the two drift apart.

Two entries there are easy to miss and both bite silently:

- **`CRON_IN_PROCESS=true`** — required off Railway. See "Scheduled jobs".
- **`REVIEW_URL`** — unset, your customers are sent to another agency's review
  page. See "Known limitations".

### Build the schema

> **This is the step that does not work yet.** See "Known limitations". On a
> database that already has the schema, the runner is proven and correct; on an
> empty one it cannot build from nothing.

```bash
DATABASE_URL='postgresql://...' npm run migrate:status   # read-only, safe
DATABASE_URL='postgresql://...' npm run migrate
```

The runner applies `migrations/*.sql` in filename order, records each in
`schema_migrations` only after it succeeds, and stops at the first failure
without recording it — so fixing and re-running resumes from the file that
failed. It names the target database and asks before writing, unless `--yes`.

**Getting `DATABASE_URL` right is the fiddly part.** In the Supabase dashboard:
**Connect → Session pooler**. Not "Direct connection", not "Transaction pooler".

| | |
|---|---|
| **Direct** `db.<ref>.supabase.co` | **IPv6-only.** On macOS `getaddrinfo` will not return the AAAA record to `pg`, so you get `ENOTFOUND` on a hostname that plainly resolves. Avoid. |
| **Session pooler**, port **5432** | Correct. Username must carry the project ref: `postgres.<ref>` |
| **Transaction pooler**, port 6543 | Breaks. These migration files carry their own `BEGIN`/`COMMIT`. |

`DATABASE_URL` is read by **nothing except the migration runner** — not the app.
Do not leave it in `.env.local`: it is a write credential the running app never
needs. Supply it for the command and drop it again.

### Adopting the runner on a database that already has the schema

If your database was built by hand-applying migrations, record them all as
applied without running any SQL:

```bash
DATABASE_URL='postgresql://...' node scripts/migrate.mjs --baseline
```

`--baseline` asserts "the schema already matches the repo". It refuses to run
against an empty database, because that would record a schema as present
without ever building it.

### Run it

```bash
npm run build
npm start                      # serves on PORT (default 3000)
```

Sign up the first user, who becomes the owner of the first organization.

## Scheduled jobs

**You do not configure cron.** The app schedules its own work in-process
(`instrumentation.ts` → `lib/cron/scheduler.ts`), which is a deliberate
advantage over configuring a system scheduler.

**But it only arms itself when `CRON_IN_PROCESS=true`, or when running on
Railway.** On your own server, without that line, none of this ever runs and
nothing tells you:

| Job | Schedule | What stops if it never runs |
|---|---|---|
| `rate-change-digest` | every 15 min | Nobody is told when supplier rates change |
| `process-agent-memory` | 02:00 | The AI stops learning from past trips |
| `data-invariants` | 03:15 | Data-integrity checks never run |
| `purge-traveller-documents` | 03:45 | **Passport scans are kept forever, past their retention window** |

That last row is a compliance problem, not an inconvenience.

Jobs claim a slot in `cron_locks` before running, so two app instances behind a
load balancer will not double-run them. The `/api/cron/*` endpoints can also be
triggered externally with `CRON_SECRET` if you would rather drive them yourself.

## Upgrading

```bash
git fetch --tags && git checkout <new tag>
npm ci
DATABASE_URL='postgresql://...' npm run migrate -- --dry-run   # read this
DATABASE_URL='postgresql://...' npm run migrate
npm run build && restart
```

The `--dry-run` step lists exactly which files are about to run. It is your last
chance to notice you are further behind than you thought.

Migrations are **append-only**: a released migration's meaning never changes, and
**a file is never renamed once any database has recorded its name** — the tracker
would then hold a name no file has, and the runner would try to re-apply schema
that is already there.

### When a migration fails

**Do not restore a database snapshot.** The runner applies one file at a time and
records each only on success, so a failure leaves the database at the last good
migration with nothing half-applied. Restoring a snapshot would discard every
booking taken since it was made, to fix a problem that has already stopped.

Instead:

1. Read the error. The runner prints the file and the message and stops.
2. Fix the cause — usually a permission, a missing extension, or a
   Supabase-managed surface.
3. Re-run `npm run migrate`. It resumes from the file that failed, because that
   file was never recorded.

## When something looks wrong

- `npm run migrate:status` — read-only; says how many migrations are applied and
  which are pending. It will not create the tracker just for being asked.
- `GET /api/version` — the commit actually deployed.
- **Email stopped arriving?** Check the Gmail connection first. All outbound mail
  goes through the connected Gmail account, and when that lapses, sends fail.
- **Reports drifting?** Check `CRON_IN_PROCESS` and whether exchange rates have
  refreshed. Without them, historical conversion silently falls back to stored
  rates and the numbers quietly stop being true.

---

## Known limitations

These are real and current. They are listed because finding them yourself, after
committing to an install, would be worse.

### A fresh install has never been performed

**The migration files cannot build this schema from nothing.** Measured
2026-08-29: of 177 objects in the reference production database, **114 were never
created by any migration**, and 36 are `ALTER`ed by migrations that never create
them. There is no `CREATE TABLE` anywhere for `itineraries`, `clients`,
`invoices`, `payments` or `suppliers`.

`migrations/` is a change log for a database that already existed, not a schema
definition. A from-scratch run dies on the first `ALTER TABLE` against a table
nothing created.

**Until T3 of `docs/plans/self-hosting.md` is done, this app can only be
installed against a database that already has the schema.** T3's first task is
to reconstruct the missing origin with `pg_dump --schema-only` and commit it as
the earliest migration.

### The operator's identity is hardcoded in 46 files

**89 occurrences** of `Travel2Egypt` and its addresses are literals in the source,
not configuration — in invoice reminders, booking confirmations, WhatsApp
templates, contract PDFs, transport vouchers and the navigation bar.

`BUSINESS_NAME`, `BUSINESS_EMAIL` and `REVIEW_URL` exist and are honoured in
*some* of those places. Most are literal strings.

**A second agency installing this today would send customer-facing email and
WhatsApp messages signed with another company's name, address and review link.**
Setting the environment variables reduces this but does not fix it. Replacing
those literals with the company profile is not scheduled work yet.

### Other things worth knowing

- **The customer portal is Japanese**, hardcoded, not internationalised. The
  staff UI is English.
- **Accounting sync (Xero, QuickBooks) has never been runtime-tested** against a
  live account.
- **`next build` does not type-check** (`ignoreBuildErrors`). Run
  `NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit` yourself.
- **Some tables have no `org_id`** (`tasks`, the conversation tables,
  `client_followups`), so they are not organization-scoped. Harmless for a
  single-agency install, which is what self-hosting means here.
