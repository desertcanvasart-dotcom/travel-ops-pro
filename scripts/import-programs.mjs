#!/usr/bin/env node
// ============================================
// Import A.T.S programme documents as ready-made tour templates
// ============================================
// Reads a directory of Japanese .docx itineraries (one per coded programme) and
// upserts each as a row in tour_templates, with the day-by-day in the `itinerary`
// JSONB column the pricing engine already reads.
//
// Usage:
//   node scripts/import-programs.mjs <dir>              # dry run + problem report
//   node scripts/import-programs.mjs <dir> --apply      # write to the database
//   node scripts/import-programs.mjs <dir> --json out.json
//
// DRY RUN IS THE DEFAULT, deliberately. The source documents are inconsistent
// in ways that matter (see scripts/lib/parse-program.mjs), and the report is
// worth reading before anything is written. Nothing is guessed: a value the
// parser does not recognise is reported against its file and imported as-is
// rather than being coerced into something that looks tidy.

import fs from 'fs'
import path from 'path'
import mammoth from 'mammoth'
import { parseProgram } from './lib/parse-program.mjs'
import {
  assignedSequence,
  auditProgramCode,
  canonicalFieldsFor,
  documentCodeConflicts,
  findSequenceCollisions,
  formatProgramCode,
  nextFreeSequence,
  parseProgramCode,
} from './lib/program-code.mjs'

const args = process.argv.slice(2)
const dir = args.find(a => !a.startsWith('--'))
const APPLY = args.includes('--apply')
const jsonFlag = args.indexOf('--json')
const JSON_OUT = jsonFlag >= 0 ? args[jsonFlag + 1] : null

if (!dir) {
  console.error('Usage: node scripts/import-programs.mjs <dir> [--apply] [--json out.json]')
  process.exit(1)
}

const C = {
  dim: s => `\x1b[2m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
}

function findDocx(root) {
  const found = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) found.push(...findDocx(full))
    else if (entry.name.toLowerCase().endsWith('.docx') && !entry.name.startsWith('~$')) {
      found.push(full)
    }
  }
  return found.sort()
}

// --- parse everything -------------------------------------------------------

const files = findDocx(dir)
if (!files.length) {
  console.error(`No .docx files under ${dir}`)
  process.exit(1)
}

const programs = []
for (const file of files) {
  const { value: html } = await mammoth.convertToHtml({ path: file })
  const program = parseProgram({
    html,
    filename: path.basename(file),
    folder: path.basename(path.dirname(file)),
  })
  program.source_path = file
  program.folder = path.basename(path.dirname(file))

  // Decode the code into fields. The string keeps whatever spelling it has —
  // historic documents are not being re-cut — but everything downstream reasons
  // about the fields, so an old spelling costs nothing.
  program.code_fields = parseProgramCode(program.code)
  program.canonical_fields = program.code_fields.valid
    ? canonicalFieldsFor(program.code_fields, program)
    : null
  program.canonical_code = program.canonical_fields
    ? formatProgramCode(program.canonical_fields)
    : null

  // A code that misstates the length or the type is not an old spelling of a
  // right fact; it is a wrong fact, and it blocks the import — UNLESS the
  // operator has already ruled on this programme, in which case the ruling is
  // the answer and there is nothing left to ask.
  program.assignment = assignedSequence(program.code)
  if (!program.assignment) {
    program.problems.push(...auditProgramCode(program.code_fields, program))
  }

  // Adjudicate a code found inside the document. Most are a filename that
  // dropped a suffix we now derive from the itinerary anyway; only a
  // disagreement the itinerary cannot settle is a real conflict.
  program.problems = program.problems.filter(problem => {
    if (problem.kind !== 'document_code_mismatch') return true
    if (program.assignment) return false

    const conflict = documentCodeConflicts(
      problem.documentCode,
      program.canonical_fields,
      program
    )
    if (conflict) {
      problem.message += ` — they disagree on ${conflict.join(' and ')}, which the itinerary cannot settle`
      return true
    }

    // Cleared on evidence — but say WHICH of the two is the wrong one, because
    // "they disagree" is not an instruction anyone can act on. When the label
    // inside the document already matches what the itinerary says, the label is
    // right and the FILENAME is the one missing something.
    const inner = parseProgramCode(problem.documentCode)
    const labelAgrees =
      inner.valid &&
      inner.carrier === program.canonical_fields.carrier &&
      inner.days === program.canonical_fields.days

    problem.severity = 'warning'
    problem.message = labelAgrees
      ? `The filename says ${program.code} but the document says ${problem.documentCode}, ` +
        `which matches the itinerary. The label is right; the FILENAME is the short one.`
      : `A stale "${problem.documentCode}" label is left inside the document. ` +
        `The itinerary is consistent with ${program.code}, so this imports — ` +
        `but the label is wrong and worth correcting at the source.`
    return true
  })

  programs.push(program)
}

// --- report -----------------------------------------------------------------

console.log(`\n${C.bold('PROGRAMMES')}  ${programs.length} documents under ${dir}\n`)
console.log(
  C.dim(
    '  CODE          AIR  DAYS  NTS  MENU  HOTELS  CITIES                                  ISSUES'
  )
)

let errorCount = 0
let warningCount = 0

for (const p of programs) {
  const errors = p.problems.filter(x => x.severity === 'error').length
  const warnings = p.problems.filter(x => x.severity === 'warning').length
  errorCount += errors
  warningCount += warnings

  const issues =
    (errors ? C.red(`${errors} error${errors > 1 ? 's' : ''}`) : '') +
    (errors && warnings ? ' ' : '') +
    (warnings ? C.yellow(`${warnings} warn`) : '') || C.green('clean')

  const cities = p.cities_covered.join(', ')
  console.log(
    `  ${(p.code ?? '??').padEnd(13)} ${(p.airline ?? '--').padEnd(4)} ` +
      `${String(p.duration_days).padStart(4)} ${String(p.duration_nights).padStart(4)}  ` +
      `${p.has_menu ? ' yes' : '  - '}  ${String(p.hotels.length).padStart(6)}  ` +
      `${cities.slice(0, 38).padEnd(38)}  ${issues}`
  )
}

// --- code report -------------------------------------------------------------
// Deviations are not failures. They are the ways an existing code is spelled
// differently from the canon, listed so the shape of the drift is visible —
// and so anything created from here can be held to the standard.

const deviating = programs.filter(p => p.code_fields?.deviations?.length)
if (deviating.length) {
  console.log(`\n${C.bold('CODES')}  ${deviating.length} of ${programs.length} deviate from the canon`)
  console.log(
    C.dim(
      '  The CANONICAL code comes first — it is what the system stores and shows\n' +
        '  (ruled 2026-08-17). Source documents keep their old spellings; an\n' +
        '  existing row under the old spelling is renamed, not duplicated.\n'
    )
  )
  console.log(
    C.dim('  CANONICAL            was written as   DEPARTS     CARRIER    CABIN     WHAT DIFFERED')
  )
  for (const p of deviating) {
    const f = p.code_fields
    const why = f.deviations.map(d => d.kind).join(', ')
    // Pad BEFORE colouring — escape codes have width in a string and none on
    // screen, so padding a coloured value misaligns every column after it.
    const departs = f.airport_name
      ? f.airport_name.padEnd(12)
      : C.yellow('not stated'.padEnd(12))
    console.log(
      `  ${C.green((p.canonical_code ?? '—').padEnd(20))} ${C.dim((p.code ?? '?').padEnd(16))}` +
        `${departs}${(f.carrier_name ?? '?').padEnd(11)}` +
        `${(f.service_class ?? '?').padEnd(10)}${C.dim(why)}`
    )
  }
}

const entries = programs
  .filter(p => p.canonical_fields)
  .map(p => ({ code: p.code, fields: p.canonical_fields }))
const collisions = findSequenceCollisions(entries)
if (collisions.length) {
  console.log(`\n${C.bold('SEQUENCE COLLISIONS')}\n`)
  for (const c of collisions) {
    const [airport, carrier, days] = c.bucket.split('/')
    const free = nextFreeSequence(entries, { airport, carrier, days: Number(days) })
    console.log(
      `  ${C.yellow(c.codes.join('  ·  '))}\n` +
        C.dim(
          `    ${c.identities.length} different programmes share ${days}-day #${c.sequence} ` +
            `on ${carrier}/${airport}: ${c.identities.join(' vs ')}\n` +
            `    ${c.identities.length - 1} need a new number. Next free: ${free}\n`
        )
    )
  }
}

const withProblems = programs.filter(p => p.problems.length)
if (withProblems.length) {
  console.log(`\n${C.bold('PROBLEMS')}\n`)
  for (const p of withProblems) {
    console.log(`  ${C.bold(p.code ?? p.filename)}  ${C.dim(p.filename)}`)
    for (const problem of p.problems) {
      const tag = problem.severity === 'error' ? C.red('error') : C.yellow('warn ')
      const where = problem.day ? C.dim(` (day ${problem.day})`) : ''
      console.log(`    ${tag} ${problem.message}${where}`)
    }
    console.log()
  }
}

console.log(
  `${C.bold('TOTAL')}  ${programs.length} programmes · ` +
    `${programs.reduce((n, p) => n + p.days.length, 0)} days · ` +
    `${errorCount ? C.red(`${errorCount} errors`) : '0 errors'} · ` +
    `${warningCount ? C.yellow(`${warningCount} warnings`) : '0 warnings'}\n`
)

if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify(programs, null, 2))
  console.log(`Wrote ${JSON_OUT}\n`)
}

if (!APPLY) {
  console.log(C.dim('Dry run. Re-run with --apply to write these to tour_templates.\n'))
  process.exit(0)
}

// --- write ------------------------------------------------------------------

const env = { ...process.env }
try {
  for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    if (!env[k]) env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch {
  /* env file optional */
}

const { createClient } = await import('@supabase/supabase-js')
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const blocked = programs.filter(p => p.problems.some(x => x.severity === 'error'))
if (blocked.length) {
  console.log(
    C.red(
      `Refusing to import ${blocked.length} programme(s) with errors: ` +
        blocked.map(p => p.code ?? p.filename).join(', ')
    )
  )
  console.log(C.dim('Fix the source documents, or import the rest by moving these aside.\n'))
}

let written = 0
for (const p of programs) {
  if (p.problems.some(x => x.severity === 'error')) continue

  // The system stores the CANONICAL code (operator ruling, 2026-08-17): the
  // documents keep their legacy spellings, but everything created inside the
  // system is held to the standard. The old spelling still resolves — a row
  // imported under it is renamed below before this upsert.
  const finalCode = p.canonical_code ?? p.code

  const row = {
    template_code: finalCode,
    // Composed from facts the document states — duration and the places it
    // actually visits — because the source has no English names and inventing
    // marketing copy would put words in the operator's mouth. A real name is
    // theirs to write; this is a legible placeholder in a picker.
    template_name: p.cities_covered.length
      ? `${finalCode} — ${p.duration_days} days: ${p.cities_covered.join(', ')}`
      : `${finalCode} — ${p.duration_days} days`,
    duration_days: p.duration_days,
    duration_nights: p.duration_nights,
    cities_covered: p.cities_covered,
    tour_type: p.days.some(d => d.is_cruise_day) ? 'cruise' : 'land',
    uses_day_builder: false,
    pricing_mode: 'auto',
    is_active: true,
    itinerary: p.days.map(d => ({
      day: d.day,
      city: d.city,
      title: d.title,
      description: d.description,
      meals: d.meals,
      attractions: d.attractions,
      services: d.services,
      is_cruise_day: d.is_cruise_day,
      overnight_city: d.overnight_city,
      accommodation_type: d.accommodation_type,
      ...(d.menu ? { menu: d.menu } : {}),
    })),
  }

  // Rename an existing row that carries the legacy spelling BEFORE upserting on
  // the canonical one — otherwise a re-import would insert a duplicate and
  // strand the old row (with its id, and anything hanging off that id).
  if (finalCode !== p.code) {
    const { data: oldRows } = await supabase
      .from('tour_templates')
      .select('id')
      .eq('template_code', p.code)
    if (oldRows?.length) {
      const { data: canonRows } = await supabase
        .from('tour_templates')
        .select('id')
        .eq('template_code', finalCode)
      if (canonRows?.length) {
        // Both spellings exist as separate rows — renaming would collide, and
        // which row is the real one is not this script's call to make.
        console.log(
          C.red(
            `  ${p.code}: a row already exists under ${finalCode} — ` +
              'two rows for one programme; resolve manually, skipping.'
          )
        )
        continue
      }
      const { error: renameError } = await supabase
        .from('tour_templates')
        .update({ template_code: finalCode })
        .eq('template_code', p.code)
      if (renameError) {
        console.log(C.red(`  ${p.code} → ${finalCode}: rename failed: ${renameError.message}`))
        continue
      }
      console.log(C.dim(`  renamed ${p.code} → ${finalCode}`))
    }
  }

  const { error } = await supabase
    .from('tour_templates')
    .upsert(row, { onConflict: 'template_code' })

  if (error) {
    console.log(C.red(`  ${p.code}: ${error.message}`))
    continue
  }
  written++
}

console.log(C.green(`\nImported ${written} programme(s) into tour_templates.\n`))
