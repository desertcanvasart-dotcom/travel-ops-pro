// Japanese twins of the customer and internal message templates
// (migrations/data/message-templates.ja.mjs) must carry exactly the
// placeholders of their English originals (message-templates.en.json): a
// missing {{BalanceDueDate}} is a reminder with no date; an invented
// {{CompanyName}} is a literal "{{CompanyName}}" in a customer's inbox.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { JA_TEMPLATES } from '../../migrations/data/message-templates.ja.mjs'

const EN = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'migrations/data/message-templates.en.json'), 'utf8')) as Array<{ name: string; channel: string; category: string; subject: string | null; body: string }>
const placeholders = (s: string | null | undefined) => [...new Set([...String(s || '').matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)].map(m => m[1]))].sort()
const key = (t: { name: string; channel: string }) => `${t.name}|${t.channel}`

describe('Japanese message templates', () => {
  it('cover every customer and internal English template, and nothing else', () => {
    const enKeys = EN.filter(e => e.category === 'customer' || e.category === 'internal').map(key).sort()
    const jaKeys = JA_TEMPLATES.map(key).sort()
    expect(jaKeys).toEqual(enKeys)
    expect(new Set(jaKeys).size).toBe(jaKeys.length)
  })

  it('use exactly the placeholders of their English twin', () => {
    const bad: string[] = []
    for (const ja of JA_TEMPLATES) {
      const en = EN.find(e => key(e) === key(ja))!
      const a = placeholders(en.body + ' ' + (en.subject || '')), b = placeholders(ja.body + ' ' + (ja.subject || ''))
      if (JSON.stringify(a) !== JSON.stringify(b)) bad.push(`${key(ja)}: en [${a}] vs ja [${b}]`)
    }
    expect(bad).toEqual([])
  })

  it('are actually Japanese, with a subject wherever the English has one', () => {
    for (const ja of JA_TEMPLATES) {
      const en = EN.find(e => key(e) === key(ja))!
      expect(/[぀-ヿ一-鿿]/.test(ja.body), `${key(ja)} body has no Japanese`).toBe(true)
      if (en.subject) expect(ja.subject, `${key(ja)} subject`).toBeTruthy()
      expect(ja.description, `${key(ja)} description`).toBeTruthy()
    }
  })
})
