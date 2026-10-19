// "Please reconnect your Gmail account" was masked as "Internal server error"
// in production (clientMessage hides every message there), so staff never
// learnt the fix was one click in Settings. GmailAuthError messages are
// written for the user; these routes must pass them through.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROUTES = [
  'app/api/email/sync/route.ts',
  'app/api/gmail/emails/route.ts',
  'app/api/gmail/poll/route.ts',
  'app/api/gmail/send/route.ts',
  'app/api/gmail/threads/route.ts',
  'app/api/send-supplier-document/route.ts',
  'app/api/templates/send/route.ts',
]

describe('GmailAuthError reaches the user', () => {
  for (const route of ROUTES) {
    it(route, () => {
      const src = readFileSync(join(process.cwd(), route), 'utf8')
      const blocks = src.split(/instanceof GmailAuthError/).slice(1)
      expect(blocks.length).toBeGreaterThan(0)
      for (const block of blocks) {
        // Up to the `if`'s closing brace: the generic fallback after it
        // rightly keeps clientMessage.
        const handler = block.slice(0, block.indexOf('\n    }') + 1 || 200)
        expect(handler).not.toMatch(/clientMessage\(/)
        expect(handler).toMatch(/(err|error)\.message/)
      }
    })
  }
})
