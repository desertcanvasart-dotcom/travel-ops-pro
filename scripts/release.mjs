#!/usr/bin/env node
// ============================================
// Cut a release
// ============================================
// T5 of docs/plans/self-hosting.md. "Which version is this customer running?"
// needs an answer, and until now there was none: package.json said 0.1.1 and
// had said so for every deploy this year, so it identified nothing.
//
//   npm run release              # dry run — prints what it would do
//   npm run release -- --yes     # actually cut it
//
// A release is: package.json version set to YYYY.MM.DD, one commit, one
// annotated tag vYYYY.MM.DD, pushed. Nothing else. The tag is what support is
// offered against, so cutting one has to be deliberate and hard to get wrong.
//
// WHAT IT REFUSES, AND WHY EACH
//
//   dirty working tree   — a release would contain uncommitted work nobody
//                          reviewed, and the tag would point at something no
//                          branch contains.
//   not on main          — releases come from the branch CI gates.
//   behind origin        — you would tag a commit that is not the tip, and the
//                          customer would get less than main has.
//   CI not green         — the whole point of a tag is that it was checked.
//                          A tag on a red commit is a promise we did not keep.
//   tag already exists   — a released tag's meaning never changes. Same rule as
//                          a released migration.
//
// It does NOT push automatically without --yes, and it prints the exact
// commands it is about to run first.

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { isReleaseVersion } from '../lib/support/bundle-core.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG = path.join(ROOT, 'package.json')
const APPLY = process.argv.includes('--yes')

const sh = (cmd, allowFail = false) => {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
  } catch (err) {
    if (allowFail) return null
    throw new Error(`${cmd} failed: ${err.stderr?.toString().trim() || err.message}`)
  }
}

/** YYYY.MM.DD, with -2, -3 … if the day already has a release. */
export function nextVersion(today, existingTags) {
  const base = today
  const taken = new Set(existingTags)
  if (!taken.has(`v${base}`)) return base
  for (let n = 2; n < 100; n++) {
    if (!taken.has(`v${base}-${n}`)) return `${base}-${n}`
  }
  throw new Error(`more than 99 releases on ${base}; something is wrong`)
}

function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'STOP'}  ${label}${detail ? `  — ${detail}` : ''}`)
  return ok
}

async function main() {
  console.log(APPLY ? '=== CUTTING A RELEASE ===\n' : '=== DRY RUN — nothing will be changed ===\n')

  let problems = 0
  const fail = () => { problems++ }

  const branch = sh('git rev-parse --abbrev-ref HEAD')
  if (!check('on main', branch === 'main', `currently ${branch}`)) fail()

  const dirty = sh('git status --porcelain')
  if (!check('working tree clean', dirty === '', dirty ? `${dirty.split('\n').length} change(s)` : '')) fail()

  sh('git fetch origin --quiet', true)
  const counts = sh('git rev-list --left-right --count origin/main...HEAD', true) ?? '? ?'
  const [behind, ahead] = counts.split(/\s+/)
  if (!check('in sync with origin/main', behind === '0' && ahead === '0', `behind ${behind}, ahead ${ahead}`)) fail()

  const sha = sh('git rev-parse HEAD')

  // CI green on exactly this commit. `gh` is how this project already gates
  // merges; if it is not available, say so rather than assuming green.
  const conclusion = sh(
    `gh run list --commit ${sha} --limit 1 --json conclusion --jq '.[0].conclusion'`,
    true,
  )
  if (!check('CI green on this commit', conclusion === 'success', conclusion ?? 'could not read CI status')) fail()

  const tags = (sh('git tag --list', true) ?? '').split('\n').filter(Boolean)
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '.')
  const version = nextVersion(today, tags)
  const tag = `v${version}`
  if (!check('tag is free', !tags.includes(tag), tag)) fail()

  console.log('')
  console.log(`  version : ${version}`)
  console.log(`  tag     : ${tag}`)
  console.log(`  commit  : ${sha.slice(0, 12)}…`)

  if (problems > 0) {
    console.error(`\nABORTED: ${problems} check(s) failed. Nothing was changed.`)
    process.exit(1)
  }

  const pkg = JSON.parse(readFileSync(PKG, 'utf8'))
  const wasRelease = isReleaseVersion(pkg.version)
  console.log(`  package.json version: ${pkg.version}${wasRelease ? '' : ' (not a release)'} → ${version}`)

  if (!APPLY) {
    console.log('\nWould run:')
    console.log(`  (write package.json version = ${version})`)
    console.log(`  git commit -am "chore(release): ${version}"`)
    console.log(`  git tag -a ${tag} -m "Release ${version}"`)
    console.log(`  git push origin main ${tag}`)
    console.log('\nRe-run with --yes to cut it.')
    return
  }

  pkg.version = version
  writeFileSync(PKG, `${JSON.stringify(pkg, null, 2)}\n`)
  sh('git add package.json')
  sh(`git commit -m "chore(release): ${version}"`)
  sh(`git tag -a ${tag} -m "Release ${version}"`)
  sh(`git push origin main ${tag}`)

  console.log(`\nReleased ${tag}.`)
  console.log('A customer upgrades with:')
  console.log(`  git fetch --tags && git checkout ${tag} && npm ci`)
  console.log('  DATABASE_URL=… npm run migrate -- --dry-run   # read it')
  console.log('  DATABASE_URL=… npm run migrate')
  console.log('  npm run build && restart && npm run doctor')
}

// Importable for tests without running the release.
if (process.argv[1] && process.argv[1].endsWith('release.mjs')) {
  main().catch(err => {
    console.error(err.message)
    process.exit(1)
  })
}
