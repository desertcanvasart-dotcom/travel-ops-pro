// The inbox message box (components/whatsapp/MessageBox.tsx): a textarea that
// keeps line breaks. Enter sends, Shift+Enter is a new line, and the Enter
// that confirms an IME word (Japanese, Chinese) does not send.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { shouldSendOnKey } from '@/components/whatsapp/MessageBox'

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('shouldSendOnKey', () => {
  it('Enter sends', () => {
    expect(shouldSendOnKey({ key: 'Enter', shiftKey: false })).toBe(true)
  })
  it('Shift+Enter starts a new line instead', () => {
    expect(shouldSendOnKey({ key: 'Enter', shiftKey: true })).toBe(false)
  })
  it('the Enter that confirms an IME word does not send', () => {
    expect(shouldSendOnKey({ key: 'Enter', shiftKey: false, isComposing: true })).toBe(false)
    // Safari: keyCode 229 with isComposing already false
    expect(shouldSendOnKey({ key: 'Enter', shiftKey: false, isComposing: false, keyCode: 229 })).toBe(false)
  })
  it('other keys never send', () => {
    expect(shouldSendOnKey({ key: 'a', shiftKey: false })).toBe(false)
  })
})

describe('both inboxes use the multi-line box', () => {
  for (const file of ['app/inbox/_views/WhatsAppView.tsx', 'components/unified/UnifiedMessageThread.tsx']) {
    it(file, () => {
      const s = src(file)
      expect(s).toContain('<MessageBox')
      // the one-line input that dropped line breaks is gone
      expect(s).not.toMatch(/<input\s+type="text"\s+value=\{newMessage\}/)
      expect(s).not.toMatch(/<input\s*\n\s*type="text"\s*\n\s*value=\{newMessage\}/)
    })
  }
})
