# Release: the menu-group audit (Home → Settings)

Everything from PRs #608–#621 and the Settings audit (`claude/audit-settings`),
brought up to date with `main` (the AUDIT-FINDINGS fixes and the inbox rounds,
#622–#624), in one PR.

The order matters. The company migrations (`20261203`–`20261209`) give staff,
tasks, email, suppliers, rates, tours and content a required company link
(`org_id`). Today's live code does not fill it, so once they are in, saves
fail until the new code is live. Keep the time between step 1 and step 2
short, and do it when nobody is working (late evening).

## 0. Before you start (any time)

1. Supabase → Database → Backups: make sure there is a backup from today
   (or create one). This is the way back if a migration fails half-way.
2. Run `0-check.sql` (read-only). Send the result: `20261203`–`20261209`,
   `20261215`, `20261216`, `20261228` and `20270103`–`20270105` should be
   "not recorded"; everything else "recorded". Anything else, stop and ask.

## 1. The company migrations (just before the merge)

Run `1-before-deploy.sql` in the Supabase SQL editor (paste the whole file,
Run). It applies `20261203`–`20261209` in order and records each one.

If it stops with an error: nothing after the failing file has run, and the
failing file itself is rolled back (each is one transaction). Do not merge;
send the error.

## 2. Merge and deploy (straight after step 1)

Merge the release PR into `main`. Railway deploys it (about 5 minutes). Wait
until the new version is live (the deploy shows Active).

## 3. The rest of the migrations (once the new code is live)

Run `2-after-deploy.sql`. It runs `20261210`–`20270105` in order — the ones
never applied, and again the ones applied earlier, which then complete the
parts they skipped because the company columns did not exist yet. Every one
of them is written to be safe to run twice.

## 4. Check

- Run `0-check.sql` again: every row "recorded".
- In the app, as an admin: open a trip and save it in the Pricing Grid; add a
  task; open the Inbox and send yourself an email; open Settings → Users.
- As an agent: open Preferences and Profile; check Settings → Users is not
  offered.

## Known gaps (not in this release)

- Deactivating someone does not end the sessions they already have open.
- Prices saved in the trip editor are not in the activity log.
