# Running Autoura on a customer's own server

Status: **T1–T5 done.** Written
2026-08-28, revised 2026-08-29.

This app is what gets installed on a customer's server. That is a different
thing from being deployed to Railway by the people who wrote it, and the
difference is roughly this document.

---

## 1. What we can do today

Nothing repeatable. There is no install procedure, and the pieces that would
make one do not exist:

| Needed to install this anywhere | State |
|---|---|
| A list of what to configure | **done** — `.env.example`, derived from the code and kept in sync by a test |
| An install procedure | **done** — `docs/SELF-HOSTING.md`, with its blockers stated up front |
| A way to build the schema | **partly** — `scripts/migrate.mjs` applies them in order (T1). But see T3: the files cannot build a schema from nothing |
| A record of which migrations ran | **done** — `schema_migrations`; production baselined 2026-08-29 (125 recorded, 0 pending) |
| Proof a fresh install works | **done** — `npm run replay:schema`, a CI gate since the T3 squash |
| A way to see what went wrong remotely | **done** — `npm run doctor`, `/api/support-bundle`, `/api/health/deep` |

The last row is what prompted this. It is not the first one to fix: a support
bundle reporting on an install nobody can reproduce is a thermometer in a room
with no walls.

**None of this is a criticism of how the app got here.** One deployment,
maintained by the person who wrote it, needs none of it. A second copy on
somebody else's machine needs all of it.

## 2. What the sibling already solved

`autoura-saas` went through exactly this (its plan §5). Its answers are proven
and portable, and porting beats reinventing:

- `scripts/migrate.mjs` + `migrate-core.mjs` — apply every unrecorded file in
  name order, record each only after it succeeds, stop loudly on the first
  failure without recording it. `--status`, `--dry-run`, `--baseline`.
- `schema_migrations (name, applied_at)` as the tracker.
- A from-scratch replay test in CI that builds the whole schema against a real
  Postgres on every run. **On the sibling this found six defects in historical
  migrations** — including an index predicate no Postgres would ever accept —
  none of which mattered until somebody installed from scratch. **That
  experience does not transfer directly**: the sibling's migrations could build
  its schema and merely did it wrong in six places. Ours cannot build one at
  all — see T3.
- `.env.example`, `docs/SELF-HOSTING.md`, tagged releases.
- The support toolkit built this week: `doctor.mjs`, a redacted support bundle,
  `job_runs`, a gated deep health probe.

## 3. One thing this app does better

Its cron scheduler runs **in-process** (`instrumentation.ts` →
`lib/cron/scheduler.ts`), so a customer configures no cron at all. The sibling
needs five endpoints wired into whatever scheduler the customer has, and
`docs/CRON-JOBS.md` describes a Railway dashboard they do not have.

Keep that. It is a genuine advantage for self-hosting, and it means the port of
`job_runs` here is about proving the in-process scheduler is *alive*, not about
proving somebody configured cron correctly.

## 4. Phases

**T1 — the migration runner and the tracker.** ✅ **DONE — built, merged (#263) and applied to production 2026-08-29.** Port `migrate.mjs` +
`migrate-core.mjs`. Add `schema_migrations`. Baseline this database — record all
125 existing files as applied without running them, since they already are.
Until this exists nothing else can be trusted, including "which version is this
customer on?".

> **What T1 actually found.** The port was not clean, because this repo's
> filenames could not be sorted into an apply order. 114 migrations were
> date-prefixed (`20260203_x.sql`); **11 were bare** (`create_bookings_tables.sql`).
> Digits sort before letters, so a plain name sort put the eleven OLDEST files
> LAST — and two of them (`b2b_quotes_itinerary_bridge`, `add_generation_warnings`)
> are not oldest at all, they interleave with the dated ones. Sorting by name
> would have built the schema in an order that has never existed.
>
> The eleven were renamed to their true dates, taken from the git commit that
> added each one. **That was safe exactly once and the window is now closed:**
> no database had ever recorded a migration name, because no tracker existed.
> After a baseline, renaming a file means the tracker holds a name no file has,
> and the runner tries to re-apply schema that is already there.
>
> `assertOrderable()` now refuses to run if any migration lacks a `YYYYMMDD_`
> prefix, and a test asserts it against the real `migrations/` directory, so
> the problem cannot come back.
>
> **Two guards were added that the sibling does not have**, both from incidents
> this project has actually had:
> - The runner refuses a database that looks like autoura-saas (`tenants` but no
>   `organizations`). On 2026-08-28 a migration was pasted into the wrong
>   Supabase project; it failed and rolled back, which was luck rather than design.
> - It refuses `--baseline` on an empty database — that would record a schema as
>   applied without building it, and no later run would ever build it.
>
> Anything that writes names the target database and asks first, unless `--yes`.
>
> **Baselined against production 2026-08-29:** `125 recorded, 0 pending`, and a
> second `--baseline` is a clean no-op. The runner is now proven end to end
> against a real database.
>
> **Connection note, because it cost an hour.** Supabase's *direct* host
> `db.<ref>.supabase.co` is IPv6-only, and macOS `getaddrinfo` will not return
> the AAAA record to `pg` — you get `ENOTFOUND` even with working IPv6. Use the
> **session pooler**: username must carry the project ref
> (`postgres.<ref>`), port **5432** (session), never 6543 (transaction mode
> breaks the `BEGIN`/`COMMIT` these files carry). `DATABASE_URL` is read by
> nothing but this runner — it is not set on Railway, and the app authenticates
> with `SUPABASE_SERVICE_ROLE_KEY`, so resetting the Postgres password does not
> affect production.

**T2 — the install procedure.** ✅ **DONE.** `.env.example` and
`docs/SELF-HOSTING.md`.

> **Not a port after all.** The sibling's template describes a different app.
> `.env.example` here was derived by grepping `process.env` across `app/`,
> `lib/`, `components/`, `middleware.ts` and `instrumentation.ts` — 54 distinct
> variables — and `__tests__/env-example-sync.test.ts` fails if the code and the
> template drift in either direction.
>
> **Two findings that change what T2 delivers:**
>
> 1. **`CRON_IN_PROCESS=true` is required off Railway.** The in-process
>    scheduler — §3's stated advantage — arms only when `RAILWAY_SERVICE_NAME`
>    exists or that flag is explicitly true. A self-hosted install has neither,
>    so all four jobs silently never run, including the retention purge that
>    destroys passport scans after a trip. §3's claim that "a customer
>    configures no cron at all" is true only with that one line.
> 2. **The operator's identity is hardcoded in 46 files, 89 occurrences.**
>    `Travel2Egypt` and its addresses are literals in invoice reminders, booking
>    confirmations, WhatsApp templates, contract PDFs and vouchers.
>    `BUSINESS_NAME`/`BUSINESS_EMAIL`/`REVIEW_URL` are honoured in *some* of
>    those places; most are not. A second agency would send customer-facing mail
>    signed with this one's name — and `REVIEW_URL` unset sends their customers
>    to this agency's Google review page. **This is a blocker for a real second
>    install and is not scheduled work.**
>
> Also found: `DEFAULT_CURRENCY`, `MARKUP_PERCENTAGE` and `GMAIL_APP_PASSWORD`
> are set in production and on Railway and read by nothing. `.env.example` says
> to delete them.
>
> `docs/SELF-HOSTING.md` states both blockers up front rather than letting
> someone discover them after committing to an install.

**T3 — prove a fresh install works.** ✅ **DONE.** The from-scratch replay in CI.

> **This phase was scoped wrongly and the estimate below replaces it.** The
> original text said to expect the replay to fail the first time and to treat
> fixing what it found as T3's work — modelled on the sibling, where the same
> test surfaced six defects in historical files. Measured on 2026-08-29, this
> repository is not in that situation:
>
> | | |
> |---|---|
> | objects in production | 177 |
> | of those, never created by any migration | **114** |
> | `CREATE TABLE` statements across all 125 files | 59 |
> | tables `ALTER`ed by a migration that never creates them | **36** |
>
> There is **no `CREATE TABLE` anywhere** for `itineraries`, `clients`,
> `invoices`, `payments`, `suppliers`, `expenses`, `commissions`,
> `notifications`, `b2b_partners` or `content_library`.
>
> `migrations/` is not a schema definition. It is a change log for a database
> that already existed and was built by hand. A from-scratch replay will not
> "find six defects" — **it dies on the first `ALTER TABLE` against a table
> nothing created**, and it will keep dying until a schema exists to alter.

**Measured, not predicted (2026-08-29).** `npm run replay:schema` now exists and
replays every migration against a real Postgres:

```
applied  17 / 125      failed 107      exempt 1
  102x  relation "..." does not exist
    5x  function public.user_is_in_org(uuid) does not exist
```

The five are cascade — the migration defining that function is itself among the
102. The harness stubs everything Supabase provides (the `auth` schema, the
three API roles, `auth.users`, `auth.uid()`, pgcrypto, uuid-ossp) rather than
exempting the files that need them, so no environmental excuse is left. **Every
remaining failure has one cause: nothing creates the base tables.** Only one
file is exempt, and only because PGlite does not ship `vector`.

T3's real first task is therefore to **reconstruct the missing origin**, not to
fix defects:

1. `pg_dump --schema-only --no-owner --no-privileges` the production database
   and commit the result as the earliest migration. That file *is* the 114
   objects nobody ever wrote a migration for.
2. Replay = that baseline, then the 125 existing files in order. Only once that
   runs green end to end does the replay start doing the job the sibling's does,
   which is catching defects in new migrations.
3. Expect the dump to need hand-editing: Supabase-managed surfaces (storage
   buckets, `auth.*` references, extensions, realtime publications, grants)
   do not replay cleanly against a bare Postgres. The sibling exempts seven
   files for exactly this reason; budget for the same treatment here.

> **T3 OUTCOME (2026-08-29).** The dump applied cleanly after four
> transformations: strip pg_dump 18's `\restrict` meta-commands, make
> `CREATE SCHEMA public` idempotent, drop the PG17-only `transaction_timeout`,
> and remove `match_copilot_knowledge` (typed on `public.vector`, which the
> `--exclude-table` flag cannot reach).
>
> **The baseline SUPERSEDES the history — it cannot precede it.** Replaying the
> 125 files on top of the baseline gave 111 ok / 14 failed, all "already
> exists": the baseline is the schema AFTER those migrations, so they
> double-apply. So the 125 moved to `migrations/archive/` and are never
> replayed. `migrations/` now holds the baseline plus anything newer, which is
> exactly what a fresh install runs.
>
> **Two things cost real time and are worth knowing:**
> - Supabase installs extensions into an `extensions` schema, and column
>   defaults call `extensions.uuid_generate_v4()`. Without that schema the
>   baseline dies immediately.
> - pg_dump emits `set_config('search_path', '')` and it persists **for the rest
>   of the session**, so everything after it fails to resolve unqualified names.
>   It presented as 45 unrelated "relation does not exist" errors.
>
> The runner now refuses to APPLY a baseline to a database that already has the
> schema (`checkBaselineSafety`), because a dump is not idempotent. On such a
> database it must be recorded with `--baseline`. That refusal is tested.

**The trap, now that production is baselined (2026-08-29):** the tracker holds
the 125 existing names. Adding a baseline-schema file makes it show as PENDING
on production, and a plain `migrate` run would try to *apply* it — creating
tables that already exist. So the baseline file must either be idempotent
throughout (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE VIEW`) or be
recorded on production without running, the same way `--baseline` records the
others. Decide which before the file is committed, not after.

**Estimate.** The original said this "cannot be estimated in advance", which was
true when nobody had looked. It is now: step 1 is an afternoon, step 3 is the
open-ended part, and neither can start until someone can run `pg_dump` against
production — which needs the database password and a `postgresql` client
version matching the server.

**T4 — the support toolkit.** ✅ **DONE** (T4a #274, T4b). Port
`doctor.mjs`, the support bundle, the deep health probe and `job_runs` from the
sibling.

> **T4a found the gap it was built to find, before it was even wired up.**
> Eight cron routes exist under `app/api/cron`; the in-process scheduler
> registers four. `refresh-exchange-rates`, `send-reminders`, `task-reminders`
> and `dispatch-scheduled-sends` are scheduled by nothing in this repository.
>
> `refresh-exchange-rates` demonstrably DOES run on the reference deployment —
> production rates were fetched at 01:00 on 2026-08-29 — so something external
> calls it. That could only be established because exchange rates stamp
> `api_fetched_at` on the data they write. The other three leave no trace
> whatsoever, and one of them is the retention purge for passport scans.
>
> `job-names.mjs` therefore lists all eight and marks which four are scheduled,
> so a job nothing runs is REPORTED as never having run rather than being
> quietly absent from the report.
>
> The wrapper goes on the ROUTE, not the scheduler: the in-process scheduler
> calls these handlers directly, so route-level recording covers both the
> scheduled path and any external caller. Wrapping the scheduler would have
> recorded only the four it knows about — exactly the blind spot.
>
> The redaction rules come across **unchanged** from the sibling, as the plan
> requires. The env allow-list does not: it is this product's, derived from
> `.env.example` and held there by a test, because two allow-lists drift and
> the one that drifts silently is the one deciding what leaves the server. The redaction rules and their
tests come across unchanged; what differs is this app's vocabulary
(`organizations` not `tenants`, roles not super-admin) and its in-process
scheduler.

**T5 — releases.** ✅ **DONE.** Tag one, so "which version is the customer
running?" has an answer, and `/api/version` means something on their box.

> `npm run release` is the procedure as a command: it refuses a dirty tree, a
> non-`main` branch, being out of sync, a commit CI has not passed, and a tag
> that already exists. Releases are `vYYYY.MM.DD` and `package.json` carries the
> same string, so `/api/version` reports a real identifier without needing git
> in the runtime image — which Railway does not provide.
>
> **`appVersion` alone is not proof of a release**, because a build from `main`
> after one still carries the released version. The pair (appVersion, sha) is
> what identifies a build, so `verify-deploy --tag v2026.08.29` resolves the tag
> and compares the deployed sha to it. `/api/version` reports `isRelease`, and
> the support bundle says plainly when a build was not cut as a release.
>
> One definition of "is this a release" lives in `lib/support/bundle-core.mjs`
> and is used by the release script, the endpoint and the bundle — three copies
> of a version regex is how one of them starts disagreeing.
>
> **No tag has been cut yet.** The machinery is in place and `npm run release`
> is a dry run by default; cutting the first release is a deliberate act.

## 5. Order, and why

T1 → T2 → T3 → T4 → T5, and the order is not negotiable in one place: **T3
before T4.** A support bundle whose findings say "3 migrations pending" is only
useful once applying those migrations is a command rather than an afternoon.

All five phases are done. What remains is not a phase: **the operator's identity is hardcoded in 46 files** (see T2), and a second agency's customers would receive mail signed with this one's name. That gates a real customer install more than any of T1–T5 did. T5 waits for T3, because
tagging a release that cannot be installed from scratch would be tagging a
promise we have not checked — and T3 has just turned out to be the largest
phase, not the routine one it was written as.

## 6. What NOT to do

**Do not multi-tenant this app to make it installable.** A self-hosted customer
is one agency; `organizations` already gives them what they need. The sibling
exists for the multi-tenant case and this app should not grow a second copy of
it.

**Do not port `docs/CRON-JOBS.md`.** The in-process scheduler is the better
answer here (§3), and importing the sibling's Railway-shaped instructions would
make a customer configure something they do not need.

## 7. Risks

| Risk | Mitigation |
|---|---|
| The replay finds a lot | Understated. It finds that 114 of 177 objects have no migration at all, so T3 begins by reconstructing a baseline schema from `pg_dump`, not by fixing defects. Measured 2026-08-29 — see T3 |
| Baselining the wrong database | Built, but differently than described here: the runner refuses a database that looks like autoura-saas (`tenants` but no `organizations`), refuses `--baseline` on an empty database, and names the target and asks before any write. The sibling has no such guard to port — it was written here |
| A customer installs from `main` rather than a tag | T5, and `/api/version` in the support bundle so we always know what they are running |
| Two products drift into two support toolkits | Port T4 as a port, not a rewrite. The redaction rules are the part that must not diverge |
