import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// ============================================
// Every t('key') a component asks for must exist in EVERY locale.
//
// This drifted badly and silently. The contacts page was rewritten to a nested
// namespace and ja.json was updated to match while en.json was not, so the
// English contacts page threw MISSING_MESSAGE on 55 keys. Two client-facing
// documents (invoice, receipt) were missing ~25 keys each in both locales, and
// the Japanese invoice strings existed but under `payments.invoice` while the
// page reads the top-level `invoice` namespace — so they rendered raw key paths
// to Japanese clients.
//
// None of that failed a build or a test. next-intl throws in dev and renders the
// key path in production, so a missing string looks like a cosmetic glitch on a
// page nobody happened to open in that language.
// ============================================

const ROOT = path.resolve(__dirname, '../..')
const LOCALES = ['en', 'ja'] as const

/** Files where the namespace is dynamic or plural — not statically checkable. */
const SKIP = new Set<string>([])

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue
        walk(full)
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(full)
      }
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  return out
}

function lookup(messages: unknown, dotted: string): unknown {
  let cur: unknown = messages
  for (const part of dotted.split('.')) {
    if (typeof cur !== 'object' || cur === null || !(part in cur)) return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

const messages = Object.fromEntries(
  LOCALES.map(l => [l, JSON.parse(fs.readFileSync(path.join(ROOT, 'messages', `${l}.json`), 'utf8'))])
) as Record<string, unknown>

interface Usage {
  file: string
  namespace: string
  keys: string[]
}

const usages: Usage[] = []
for (const file of [...sourceFiles(path.join(ROOT, 'app')), ...sourceFiles(path.join(ROOT, 'components'))]) {
  const rel = path.relative(ROOT, file)
  if (SKIP.has(rel)) continue
  const src = fs.readFileSync(file, 'utf8')

  // Bind each translator VARIABLE to its namespace — `const tCommon =
  // useTranslations('common')` — instead of assuming one namespace per file.
  // The old scanner skipped any file with two or more useTranslations() calls
  // as ambiguous, and that blind spot is precisely where 43 missing payments
  // keys hid until 2026-08-17: the payments pages all pair a `t` with a
  // `tCommon`, so nothing checked them.
  const bindings = new Map<string, Set<string>>()
  for (const m of src.matchAll(
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*useTranslations\('([A-Za-z0-9_.]+)'\)/g
  )) {
    if (!bindings.has(m[1])) bindings.set(m[1], new Set())
    bindings.get(m[1])!.add(m[2])
  }

  for (const [varName, namespaces] of bindings) {
    // The same variable name bound to two different namespaces (two components
    // in one file) really is ambiguous — skip the variable, not the file.
    if (namespaces.size !== 1) continue
    const [namespace] = namespaces
    // `[,)]` after the key: a call with interpolation args — t('key', {count})
    // — is a lookup too. Requiring an immediate `)` silently exempted every
    // parameterized string from this test.
    const callRe = new RegExp(
      `\\b${varName.replace(/\$/g, '\\$')}\\('([A-Za-z][A-Za-z0-9_.]*)'\\s*[,)]`,
      'g'
    )
    const keys = [...new Set([...src.matchAll(callRe)].map(m => m[1]))]
    if (keys.length) usages.push({ file: rel, namespace, keys })
  }
}

describe('i18n message coverage', () => {
  it('scans a meaningful number of components (guards against a broken scanner)', () => {
    // If the regex ever stops matching, every assertion below passes vacuously.
    expect(usages.length).toBeGreaterThan(20)
    // And specifically files with MORE THAN ONE namespace — the payments pages
    // (t + tCommon) sat unchecked for months because a previous version of the
    // scanner skipped them. If this drops to zero the binding regex broke.
    const files = new Map<string, number>()
    for (const u of usages) files.set(u.file, (files.get(u.file) ?? 0) + 1)
    const multiNamespaceFiles = [...files.values()].filter(n => n > 1).length
    expect(multiNamespaceFiles).toBeGreaterThan(5)
  })

  for (const locale of LOCALES) {
    it(`every key used by a component exists in ${locale}.json`, () => {
      const missing: string[] = []

      for (const { file, namespace, keys } of usages) {
        const base = lookup(messages[locale], namespace)
        for (const key of keys) {
          const value = lookup(base, key)
          if (value === undefined) {
            missing.push(`${locale}: ${namespace}.${key}  (${file})`)
          } else if (typeof value === 'object') {
            // A namespace where a string is expected renders as "[object
            // Object]" or throws. This is exactly how ja.json's invoice strings
            // hid under `payments.invoice` while the page wanted a label.
            missing.push(`${locale}: ${namespace}.${key} is an object, not a string  (${file})`)
          }
        }
      }

      expect(missing, `missing translations:\n${missing.join('\n')}`).toEqual([])
    })
  }

  it('every key English defines also exists in Japanese', () => {
    // ONE-WAY on purpose. English is the source locale: a string it has and
    // Japanese lacks means a Japanese user sees a raw key path, which is a bug.
    // The reverse is not — ja.json carries ~549 keys English does not, and they
    // are dead leftovers from an older message layout (`rates.tabs.*` when the
    // live keys are `rates.overview.tabs.*`, an orphaned `payments.contract.*`
    // tree). Asserting two-way parity would demand ~549 English translations
    // for strings no component reads. They are harmless; worth deleting one
    // day, not worth failing CI over.
    const flatten = (obj: unknown, prefix = ''): string[] => {
      if (typeof obj !== 'object' || obj === null) return [prefix]
      return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
        flatten(v, prefix ? `${prefix}.${k}` : k)
      )
    }

    const ja = new Set(flatten(messages.ja))
    const missingInJa = flatten(messages.en).filter(k => !ja.has(k)).sort()

    expect(
      missingInJa,
      `English defines these but Japanese does not, so a JA user sees the raw key:\n  ${missingInJa.join('\n  ')}`
    ).toEqual([])
  })
})
