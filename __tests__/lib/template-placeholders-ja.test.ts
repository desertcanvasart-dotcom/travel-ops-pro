// The placeholder picker's Japanese labels (migrations/data/template-placeholders.ja.mjs)
// must cover every placeholder in the reference snapshot, and only those.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { JA_PLACEHOLDERS } from '../../migrations/data/template-placeholders.ja.mjs'

const EN = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'migrations/data/template-placeholders.en.json'), 'utf8')) as Array<{ placeholder: string; display_name: string }>

describe('Japanese placeholder labels', () => {
  it('exist for every placeholder, and for nothing else', () => {
    const enKeys = EN.map(e => e.placeholder).sort(), jaKeys = Object.keys(JA_PLACEHOLDERS).sort()
    expect(jaKeys).toEqual(enKeys)
  })
  it('are Japanese and complete', () => {
    for (const [k, v] of Object.entries(JA_PLACEHOLDERS)) {
      expect(v.display_name, k).toMatch(/[぀-ヿ一-鿿]/)
      expect(v.description, k).toMatch(/[぀-ヿ一-鿿]/)
      expect(typeof v.example_value, k).toBe('string')
    }
  })
})
