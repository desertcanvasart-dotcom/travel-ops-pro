# Running Autoura on a customer's own server

Status: **plan, not built.** Written 2026-08-28.

This app is what gets installed on a customer's server. That is a different
thing from being deployed to Railway by the people who wrote it, and the
difference is roughly this document.

---

## 1. What we can do today

Nothing repeatable. There is no install procedure, and the pieces that would
make one do not exist:

| Needed to install this anywhere | State |
|---|---|
| A list of what to configure | **absent** — no `.env.example` |
| An install procedure | **absent** — no `docs/SELF-HOSTING.md` |
| A way to build the schema | **absent** — 125 SQL files in `migrations/`, hand-pasted into the Supabase editor in whatever order somebody remembers |
| A record of which migrations ran | **absent** — no tracker table, so "is this database up to date?" is unanswerable |
| Proof a fresh install works | **absent** — nobody has ever built this schema from zero |
| A way to see what went wrong remotely | **absent** |

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
  none of which mattered until somebody installed from scratch.
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

**T1 — the migration runner and the tracker.** ✅ **BUILT.** Port `migrate.mjs` +
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
> **Still to do on the operator's side:** run `--baseline` against production.
> Nothing has been run against a real database yet.

**T2 — the install procedure.** `.env.example` (every variable this app reads,
with which are required) and `docs/SELF-HOSTING.md` (prerequisites, first
install, upgrading, what to do when a migration fails). Both largely a port.

**T3 — prove a fresh install works.** The from-scratch replay in CI. Expect it
to fail the first time and expect that to be the point: 125 migrations written
against a database that already existed have never been asked to build one.
Fixing what it finds is T3's actual work, and it cannot be estimated in advance.

**T4 — the support toolkit.** Port `doctor.mjs`, the support bundle, the deep
health probe and `job_runs` from the sibling. The redaction rules and their
tests come across unchanged; what differs is this app's vocabulary
(`organizations` not `tenants`, roles not super-admin) and its in-process
scheduler.

**T5 — releases.** Tag one, so "which version is the customer running?" has an
answer, and `/api/version` means something on their box.

## 5. Order, and why

T1 → T2 → T3 → T4 → T5, and the order is not negotiable in one place: **T3
before T4.** A support bundle whose findings say "3 migrations pending" is only
useful once applying those migrations is a command rather than an afternoon.

T2 can start alongside T1; T5 waits for T3, because tagging a release that
cannot be installed from scratch would be tagging a promise we have not checked.

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
| The replay finds a lot | Expect it. It is T3's purpose, and every defect it finds is one a customer would have hit on day one instead |
| Baselining the wrong database | The runner refuses `.env.local`'s project without an explicit override (the sibling's guard, ported with it) |
| A customer installs from `main` rather than a tag | T5, and `/api/version` in the support bundle so we always know what they are running |
| Two products drift into two support toolkits | Port T4 as a port, not a rewrite. The redaction rules are the part that must not diverge |
