// Operator, 2026-09-19, clicking Parse on a real email:
//
//     autoura.net/whatsapp-parser?conversation=RnJvbTogSnVhbi0YSBMIFB...
//     This page isn't working — HTTP ERROR 431
//
// 431 is "Request Header Fields Too Large". The URL is part of the request
// LINE, which counts against Node's 16KB header budget; base64 costs a third
// more than the text it carries, and a Japanese email is three UTF-8 bytes per
// character before any of that. Nothing reached the app, so nothing was logged
// and nothing could be caught — the LONGER the email, the more certain the
// failure, which is exactly backwards for a parser whose job is long emails.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  stashHandoffText,
  readHandoffText,
  encodeTextParam,
  decodeTextParam,
} from '@/lib/text-handoff'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() { return this.map.size }
  key(i: number) { return [...this.map.keys()][i] ?? null }
  getItem(k: string) { return this.map.get(k) ?? null }
  setItem(k: string, v: string) { this.map.set(k, v) }
  removeItem(k: string) { this.map.delete(k) }
  clear() { this.map.clear() }
}

let storage: MemoryStorage

beforeEach(() => {
  storage = new MemoryStorage()
  ;(globalThis as any).window = { sessionStorage: storage }
})

afterEach(() => {
  delete (globalThis as any).window
})

describe('stash and read', () => {
  it('carries a text through a key, not through the URL', () => {
    const key = stashHandoffText('From: 田中様\nSubject: ご相談')
    expect(key).toBeTruthy()
    // The KEY is what travels. Whatever the email's size, this is what the
    // request line has to hold.
    expect(key!.length).toBeLessThan(32)
    expect(readHandoffText(key)).toBe('From: 田中様\nSubject: ご相談')
  })

  it('holds an email far past the header limit', () => {
    // ~120KB of Japanese: roughly 360KB of UTF-8, ~480KB base64 — twenty times
    // the budget the old URL had to fit into.
    const long = 'ナイルクルーズのご相談です。'.repeat(10000)
    const key = stashHandoffText(long)
    expect(readHandoffText(key)).toBe(long)
  })

  it('gives every handover its own key', () => {
    const a = stashHandoffText('first')
    const b = stashHandoffText('second')
    expect(a).not.toBe(b)
    expect(readHandoffText(a)).toBe('first')
    expect(readHandoffText(b)).toBe('second')
  })

  it('answers null for a key with nothing behind it', () => {
    // A URL copied into another tab, or reopened tomorrow. The page must be
    // able to SAY that — an empty box reads as "it lost my email".
    expect(readHandoffText('never-stashed')).toBeNull()
    expect(readHandoffText(null)).toBeNull()
    expect(readHandoffText(undefined)).toBeNull()
  })

  it('drops handovers older than an hour when a new one is parked', () => {
    const stale = stashHandoffText('yesterday')
    const raw = JSON.parse(storage.getItem(`travel-ops:handoff:${stale}`)!)
    storage.setItem(
      `travel-ops:handoff:${stale}`,
      JSON.stringify({ ...raw, at: Date.now() - 2 * 60 * 60 * 1000 })
    )

    const fresh = stashHandoffText('today')
    expect(readHandoffText(stale)).toBeNull()
    expect(readHandoffText(fresh)).toBe('today')
  })

  it('discards an entry it cannot read rather than keeping it forever', () => {
    storage.setItem('travel-ops:handoff:corrupt', 'not json')
    stashHandoffText('anything')
    expect(storage.getItem('travel-ops:handoff:corrupt')).toBeNull()
  })

  it('leaves keys that are not ours alone', () => {
    storage.setItem('some-other-feature', 'keep me')
    stashHandoffText('anything')
    expect(storage.getItem('some-other-feature')).toBe('keep me')
  })

  it('returns null instead of throwing when there is nowhere to park', () => {
    // The caller then falls back to the URL — which is what every caller did
    // before, and is fine for the short texts that fit.
    ;(globalThis as any).window = {
      get sessionStorage(): Storage { throw new Error('blocked') },
    }
    expect(stashHandoffText('text')).toBeNull()
    expect(readHandoffText('key')).toBeNull()
  })

  it('returns null on the server, where there is no tab', () => {
    delete (globalThis as any).window
    expect(stashHandoffText('text')).toBeNull()
    expect(readHandoffText('key')).toBeNull()
  })
})

describe('the URL fallback', () => {
  it('round-trips Japanese', () => {
    const text = 'カイロ発、ルクソール泊【00:00】'
    expect(decodeTextParam(encodeTextParam(text))).toBe(text)
  })

  it('encodes a long text without blowing the call stack', () => {
    // btoa(String.fromCharCode(...bytes)) — the old encoder in the unified
    // thread and the WhatsApp inbox — spreads the whole array into one call
    // frame and throws RangeError well before this size.
    const long = 'ナイルクルーズ'.repeat(50000)
    expect(() => encodeTextParam(long)).not.toThrow()
    expect(decodeTextParam(encodeTextParam(long))).toBe(long)
  })

  it('accepts the URL-safe alphabet and missing padding', () => {
    const text = 'ルクソール泊'
    const urlSafe = encodeTextParam(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(decodeTextParam(urlSafe)).toBe(text)
  })
})

describe('no page hands a conversation over through the URL again', () => {
  const ROOT = process.cwd()

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, out)
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
    }
    return out
  }

  const sources = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))]
    .map(f => path.relative(ROOT, f))

  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//')).join('\n')

  it.each(sources)('%s does not spread a byte array into fromCharCode', file => {
    const code = stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'))
    expect(
      /String\.fromCharCode\(\s*\.\.\./.test(code),
      `${file} spreads a whole byte array into one call frame — RangeError on a long ` +
        'conversation. Use encodeTextParam from lib/text-handoff.'
    ).toBe(false)
  })

  it('the inbox Parse button goes to the pricing module', () => {
    // An email that is a travel request is on its way to a quote, and the grid
    // parses the conversation itself.
    const src = fs.readFileSync(path.join(ROOT, 'app/inbox/page.tsx'), 'utf8')
    expect(src).toContain('/pricing-grid?${params.toString()}')
    expect(stripComments(src)).not.toContain('/whatsapp-parser?')
  })

  it('every conversation handover parks the text instead of encoding it into the URL', () => {
    for (const file of ['app/inbox/page.tsx', 'app/whatsapp-inbox/page.tsx', 'components/unified/UnifiedMessageThread.tsx']) {
      const code = stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'))
      expect(code, `${file} should stash the conversation`).toContain('stashHandoffText')
    }
  })
})
