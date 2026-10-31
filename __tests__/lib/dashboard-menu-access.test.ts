// The dashboard links only where the side menu lets the role go
// (lib/dashboard/menu-access.ts reads lib/nav/config.ts).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { canOpenFromMenu, menuRolesFor } from '@/lib/dashboard/menu-access'

describe('menu roles', () => {
  it('an item without roles takes its section’s; neither means everyone', () => {
    expect(menuRolesFor('/dashboard')).toBeNull()
    expect(menuRolesFor('/inbox?channel=all')).toEqual(['admin', 'manager', 'agent'])
    expect(menuRolesFor('/rates')).toEqual(['admin', 'manager'])
  })
  it('a sub-page is answered by the deepest menu item containing it', () => {
    expect(menuRolesFor('/itineraries/new')).toEqual(menuRolesFor('/itineraries'))
    expect(menuRolesFor('/clients/abc')).toEqual(['admin', 'manager', 'agent'])
    expect(menuRolesFor('/rates/extras')).toEqual(['admin', 'manager'])
  })
  it('a page the menu does not know is closed', () => {
    expect(menuRolesFor('/nowhere')).toBeUndefined()
    expect(canOpenFromMenu('admin', '/nowhere')).toBe(false)
  })
})

describe('what the dashboard links for each role', () => {
  const LINKS = ['/rates', '/itineraries/new', '/tours', '/tasks', '/followups', '/clients', '/itineraries', '/inbox?channel=all', '/calendar']
  const open = (role: string | null) => LINKS.filter(h => canOpenFromMenu(role, h))

  it('a viewer opens none of them', () => {
    expect(open('viewer')).toEqual([])
  })
  it('an agent does not get the Rates Hub', () => {
    expect(canOpenFromMenu('agent', '/rates')).toBe(false)
    expect(open('agent')).toEqual(expect.arrayContaining(['/followups', '/clients', '/inbox?channel=all', '/calendar']))
  })
  it('the owner and admins open all of them', () => {
    expect(open('owner')).toEqual(LINKS)
    expect(open('admin')).toEqual(LINKS)
  })
  it('no role, no links', () => {
    expect(open(null)).toEqual([])
  })
})

describe('the dashboard page asks the menu, not a list of its own', () => {
  const page = readFileSync('app/dashboard/page.tsx', 'utf8')
  it('every card, action and View all goes through linkFor', () => {
    expect(page).toContain("import { canOpenFromMenu } from '@/lib/dashboard/menu-access'")
    // No literal href on a StatCard or Quick Action any more
    expect(page).not.toMatch(/href="\/(rates|tours|tasks|clients|calendar|bookings|communications|inbox)"/)
    expect(page).toMatch(/\.filter\(a => linkFor\(a\.href\)\)/)
  })
})
