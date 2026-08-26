import { test, expect } from '@playwright/test'
import { STORAGE_STATE } from './helpers'

// Hotels and cruises used to offer three fixed price levels across four date
// boxes. Contracts run to six or more dated periods and the count varies by
// property, so the periods are a list the operator adds to. This drives the
// editor the way they will: add six, then check that the two things that are
// easy to get wrong — an overlap and an uncovered gap — are surfaced.

test.use({ storageState: STORAGE_STATE })

test('rate periods editor: six periods, overlap and gap warnings', async ({ page }) => {
  await page.goto('/rates/hotels')
  await page.getByRole('button', { name: /add rate|add first/i }).first().click()
  await expect(page.getByText(/Rate periods/).first()).toBeVisible({ timeout: 15_000 })

  const addBtn = page.getByRole('button', { name: /add period/i })
  const nameBoxes = page.getByPlaceholder('e.g. Christmas / New Year')

  // Six periods, the shape the old three-season model could not hold.
  const periods = [
    ['April', '2026-04-01', '2026-04-30'],
    ['Summer', '2026-05-01', '2026-09-30'],
    ['Autumn', '2026-10-01', '2026-12-19'],
    ['Christmas', '2026-12-20', '2027-01-05'],
    ['Winter', '2027-01-06', '2027-02-28'],
    ['Spring', '2027-03-01', '2027-03-31'],
  ]
  for (let i = 0; i < periods.length; i++) {
    await addBtn.click()
    const card = page.getByTestId('rate-period').nth(i)
    await nameBoxes.nth(i).fill(periods[i][0])
    await card.locator('input[type="date"]').nth(0).fill(periods[i][1])
    await card.locator('input[type="date"]').nth(1).fill(periods[i][2])
  }

  // Back-to-back periods: nothing to warn about.
  await expect(page.getByText(/overlap/i)).toHaveCount(0)
  await expect(page.getByText(/No period covers/i)).toHaveCount(0)
  await page.screenshot({ path: 'test-results/rate-periods-clean.png', fullPage: true })

  // Push Christmas inside Autumn → overlap warning; and open a gap before it.
  const christmas = page.getByTestId('rate-period').nth(3)
  await christmas.locator('input[type="date"]').nth(0).fill('2026-11-01')
  await expect(page.getByText(/Autumn and Christmas overlap/i)).toBeVisible()

  const winter = page.getByTestId('rate-period').nth(4)
  await winter.locator('input[type="date"]').nth(0).fill('2027-02-01')
  await expect(page.getByText(/No period covers 2027-01-06 to 2027-01-31/i)).toBeVisible()

  const warnBlock = page.getByText(/No period covers/i).locator('xpath=..')
  await warnBlock.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/rate-periods-warnings.png' })
})

test('rate periods editor is on the cruises form too', async ({ page }) => {
  await page.goto('/rates/cruises')
  await page.getByRole('button', { name: /add cruise|add first/i }).first().click()
  await expect(page.getByText(/Rate periods/).first()).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: /add period/i }).click()
  const card = page.getByTestId('rate-period').first()
  // Cruises price by cabin, so a period carries four rates per passport set.
  await expect(card.getByText('Single').first()).toBeVisible()
  await expect(card.getByText('Suite').first()).toBeVisible()
  await expect(card.locator('input[type="number"]')).toHaveCount(8)

  await page.screenshot({ path: 'test-results/rate-periods-cruise.png' })
})
