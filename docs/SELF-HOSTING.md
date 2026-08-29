# Running Autoura on your own server

Install, upgrade and diagnose. T2 of `docs/plans/self-hosting.md`.

**Read "Known limitations" at the bottom first.** Nothing there now blocks an
install, but two things are worth knowing before you commit to one.

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
git clone <this repo>
git fetch --tags && git checkout v2026.08.29   # a release, not main
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

`migrations/` holds the **baseline schema** — a dump of a real production
database — plus anything added since. Building from nothing is proven on every
CI run by `npm run replay:schema`.

The 125 files in `migrations/archive/` are history. They were written against a
database that already existed and cannot build one; they are kept so an old
database can still be understood, and are never replayed.

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

**Every run is now recorded in `job_runs`**, so "has this job ever run here?"
has an answer from inside the app. That matters because the table above is not
the whole story: **eight cron routes exist and the in-process scheduler
schedules four.** The other four — `refresh-exchange-rates`, `send-reminders`,
`task-reminders`, `dispatch-scheduled-sends` — depend on a caller this
repository does not configure. On the reference deployment
`refresh-exchange-rates` demonstrably runs, but only because exchange rates
happen to stamp a timestamp on the data they write; the other three leave no
trace at all.

On a fresh install, assume nothing outside this repository is calling anything.
Check `job_runs` after the first day: a job with no rows has never run.

## Releases

Support is offered against **tags**, not against `main`. A release is
`vYYYY.MM.DD` (with `-2`, `-3` … for a second cut the same day), and
`package.json` carries the same version without the `v`.

Cutting one is a command, so the checks cannot be skipped:

```bash
npm run release              # dry run — prints exactly what it would do
npm run release -- --yes     # cut it
```

It refuses on a dirty tree, off `main`, out of sync with origin, when CI is not
green on that exact commit, or when the tag already exists. **A released tag's
meaning never changes** — the same rule as a released migration.

**Checking what an install is actually running:**

```bash
npm run verify:deploy -- --url https://their-install --tag v2026.08.29
```

`GET /api/version` reports `appVersion`, the commit `sha`, and `isRelease`.
`appVersion` alone is not proof: a build from `main` after a release still
carries the released version. **The pair (appVersion, sha) identifies a build**,
which is why `verify-deploy` compares the sha to the tag. The support bundle
carries both, and `npm run doctor` says plainly when a build was not cut as a
release.

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

**Start here:**

```bash
npm run doctor                             # check, print findings
npm run doctor -- --bundle                 # also write support-bundle.json
npm run doctor -- --logs /var/log/app.log  # include that log, scrubbed
```

It talks to Postgres directly and reads the migration files off disk, so it
works whether or not the app is running — which matters, because the app not
running is the case you most need it for. It prints a pass/fail line per check
and then plain-language findings; most problems are a missing environment
variable or an unapplied migration, and it names both along with the command
that fixes them. Pass `DATABASE_URL` for the migration and job-history checks;
without it those are reported as **skipped**, not as failures.

**It sends nothing anywhere.** `--bundle` writes a file for you to read and then
choose to send. What it contains:

- environment variable **names** only — no value, not even a prefix
- table **counts** only — no client names, emails, passports or row content
- error lines scrubbed by pattern **and** by value: anything matching a variable
  we hold is removed whatever shape it is
- only variables this product defines; your own are not reported at all

Hostnames survive deliberately — `ENOTFOUND db.internal` keeps the host, because
which host failed is the useful half of the message.

A running install can produce the same thing from the app: sign in as an admin
and fetch `/api/support-bundle`. The script sees one thing the endpoint cannot —
which migrations are **pending**, because that needs the migration files, and
those are not in a built image.

`GET /api/health/deep` answers "is anything degraded" for a monitor. It takes
either an admin session or `Authorization: Bearer $CRON_SECRET`, returns 503
only when a dependency is genuinely down, and **reports** a stopped scheduler
without paging on it — a monitor that cries wolf gets muted.

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

### A fresh install builds, but has never been run in anger

`npm run replay:schema` builds the whole schema from nothing on every CI run —
157 tables, 19 views, 697 indexes, 274 policies. That is real proof and it did
not exist before 2026-08-29, when replaying the migrations applied 17 of 125.

What it does **not** prove: that the resulting app then works. Nobody has stood
up a second install, signed in and taken a booking on it. The schema builds;
the install has not been exercised.

Two known gaps in the replay: it runs on PGlite rather than Supabase, and the
pgvector objects (`copilot_knowledge` and its index) are created by
`archive/20260628_copilot_knowledge_rag.sql` rather than the baseline, so they
are not covered.

### The operator's identity — FIXED, with one deliberate exception

This used to say that 89 literals across 46 files would make a second agency's
customers receive mail signed with another company's name. That is fixed.

Everything customer-facing now reads the operator's own identity: the
`organizations` row (edited in Settings) preferred, falling back per field to
`BUSINESS_*` in the environment. **Blank beats fake** — an unset field prints
nothing rather than borrowing somebody else's, because a document with no
company name looks unfinished, which it is, while one naming the wrong company
looks wrong in a way the reader cannot diagnose.

`__tests__/no-hardcoded-operator-identity.test.ts` fails on any new occurrence,
including the `process.env.X || 'SomeAgency'` shape that made this configurable
in theory and wrong in practice.

**The one exception** is a marketing testimonial on the landing page, attributed
to a real named person at that company. It is a quotation, not this
application's branding, and the allow-list says so.

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
