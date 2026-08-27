import { test, expect } from '@playwright/test'
import { STORAGE_STATE } from './helpers'
test.setTimeout(120_000)
test.use({ storageState: STORAGE_STATE })

test('Half Day Tour is offered, and survives entering a duration', async ({ page }) => {
  await page.goto('/tours/manage')
  await page.waitForTimeout(3000)
  await page.getByRole('button', { name: /Add Template/i }).first().click()
  await page.waitForTimeout(1500)

  // Scope to the dialog: the page BEHIND it has a filter dropdown listing the
  // same tour types, and it comes first in the DOM. An earlier version of this
  // test was driving that one and proving nothing about the form.
  const typeSelect = page.locator('select[name="tour_type"]')
  await expect(typeSelect).toBeVisible({ timeout: 15000 })
  await expect(typeSelect.locator('option')).toContainText(['Half Day Tour'])

  await typeSelect.selectOption('half_day')
  expect(await typeSelect.inputValue()).toBe('half_day')

  // The trap: duration used to force day_tour unless the type was already
  // day_tour or stopover, silently undoing the choice just made.
  const duration = page.locator('input[name="duration_days"]')
  await duration.fill('1')
  await page.waitForTimeout(600)
  expect(await typeSelect.inputValue(), 'entering a duration overwrote Half Day').toBe('half_day')

  // A multi-day duration should still switch away from it.
  await duration.fill('3')
  await page.waitForTimeout(600)
  expect(await typeSelect.inputValue()).toBe('multi_day')

  await page.screenshot({ path: 'test-results/half-day-tour.png' })
})
