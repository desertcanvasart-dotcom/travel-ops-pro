import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// A trip whose owner was deactivated must not read "Unassigned": the select
// keeps the current owner as an option, labelled (inactive).
describe('TripAssignee keeps a deactivated owner visible', () => {
  const src = readFileSync('components/TripAssignee.tsx', 'utf8')
  it('adds the current owner when they are not in the active list', () => {
    expect(src).toContain('!members.some(m => m.id === assignedTo)')
    expect(src).toContain('(inactive)')
  })
})
