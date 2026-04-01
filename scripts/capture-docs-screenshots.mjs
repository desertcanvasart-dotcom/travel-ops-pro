#!/usr/bin/env node
/**
 * Capture screenshots of all app pages for docs.
 * Usage: node scripts/capture-docs-screenshots.mjs
 *
 * Prerequisites: The dev server must be running on port 3001
 * and you must set SCREENSHOT_EMAIL and SCREENSHOT_PASSWORD env vars.
 */

import puppeteer from 'puppeteer'
import { mkdir } from 'fs/promises'
import path from 'path'

const BASE_URL = process.env.SCREENSHOT_BASE_URL || 'https://autoura.net'
const EMAIL = process.env.SCREENSHOT_EMAIL
const PASSWORD = process.env.SCREENSHOT_PASSWORD
const OUTPUT_DIR = path.resolve('public/docs')

const SCREENSHOTS = [
  // Dashboard
  { page: '/dashboard', file: 'dashboard/full-dashboard.jpg', caption: 'Full dashboard view' },
  // Clients
  { page: '/clients', file: 'clients/client-list.jpg', caption: 'Client list page' },
  // Itineraries
  { page: '/itineraries', file: 'itineraries/itinerary-list.jpg', caption: 'Itineraries list' },
  // Communication
  { page: '/communications', file: 'communication/whatsapp-inbox.jpg', caption: 'WhatsApp inbox' },
  // Invoices
  { page: '/invoices', file: 'invoices-payments/invoices-list.jpg', caption: 'Invoices list' },
  // Payments
  { page: '/payments', file: 'invoices-payments/payments-list.jpg', caption: 'Payments list' },
  // Expenses
  { page: '/expenses', file: 'expenses-commissions/expenses-list.jpg', caption: 'Expenses list' },
  // Commissions
  { page: '/commissions', file: 'expenses-commissions/commissions-list.jpg', caption: 'Commissions list' },
  // Profit & Loss
  { page: '/profit-loss', file: 'profit-loss/pl-overview.jpg', caption: 'P&L overview' },
  // Financial Reports
  { page: '/financial-reports', file: 'profit-loss/financial-reports.jpg', caption: 'Financial reports' },
  // Bookings
  { page: '/bookings', file: 'bookings/bookings-list.jpg', caption: 'Bookings list' },
  // Calendar
  { page: '/calendar', file: 'workflows/calendar.jpg', caption: 'Calendar view' },
  // Tasks
  { page: '/tasks', file: 'workflows/tasks.jpg', caption: 'Tasks page' },
  // Suppliers
  { page: '/suppliers', file: 'resources-documents/suppliers.jpg', caption: 'Suppliers page' },
  // Tours
  { page: '/tours', file: 'tours-rates/tours-list.jpg', caption: 'Tours list' },
  // Rates
  { page: '/rates', file: 'tours-rates/rates-hub.jpg', caption: 'Rates hub' },
  // B2B Partners
  { page: '/b2b/partners', file: 'b2b-quotes/partners.jpg', caption: 'B2B Partners' },
  // B2B Quotes
  { page: '/b2b/quotes', file: 'b2b-quotes/quotes-list.jpg', caption: 'B2B Quotes list' },
  // Documents
  { page: '/documents', file: 'resources-documents/documents.jpg', caption: 'Documents page' },
  // Team Members
  { page: '/team-members', file: 'team-settings/team-members.jpg', caption: 'Team members' },
  // Settings
  { page: '/settings?tab=preferences', file: 'team-settings/settings-preferences.jpg', caption: 'Settings preferences' },
  { page: '/settings?tab=integrations', file: 'team-settings/settings-integrations.jpg', caption: 'Settings integrations' },
  // Templates
  { page: '/templates', file: 'message-templates/templates-list.jpg', caption: 'Message templates' },
  // Follow-ups
  { page: '/followups', file: 'followups-reminders/followups.jpg', caption: 'Follow-ups list' },
  // Accounts Receivable
  { page: '/accounts-receivable', file: 'invoices-payments/accounts-receivable.jpg', caption: 'Accounts Receivable' },
  // Accounts Payable
  { page: '/accounts-payable', file: 'invoices-payments/accounts-payable.jpg', caption: 'Accounts Payable' },
  // Receipts
  { page: '/receipts', file: 'invoices-payments/receipts.jpg', caption: 'Receipts' },
  // Supplier Invoices
  { page: '/supplier-invoices', file: 'invoices-payments/supplier-invoices.jpg', caption: 'Supplier Invoices' },
  // Content Library
  { page: '/content-library', file: 'tours-rates/content-library.jpg', caption: 'Content Library' },
  // Pricing Grid
  { page: '/pricing-grid', file: 'b2c-pricing/pricing-grid.jpg', caption: 'Pricing Grid' },
  // Analytics
  { page: '/analytics', file: 'dashboard/analytics.jpg', caption: 'Analytics' },
]

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('Set SCREENSHOT_EMAIL and SCREENSHOT_PASSWORD env vars')
    process.exit(1)
  }

  // Ensure output dirs exist
  for (const s of SCREENSHOTS) {
    const dir = path.dirname(path.join(OUTPUT_DIR, s.file))
    await mkdir(dir, { recursive: true })
  }

  console.log('Launching browser...')
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 },
  })

  const page = await browser.newPage()

  // Login
  console.log('Logging in...')
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2', timeout: 30000 })
  await page.waitForSelector('input[type="email"], input[placeholder*="email"]', { timeout: 10000 })

  const emailInput = await page.$('input[type="email"]') || await page.$('input[placeholder*="email"]')
  const passInput = await page.$('input[type="password"]')

  if (!emailInput || !passInput) {
    console.error('Could not find login form')
    await browser.close()
    process.exit(1)
  }

  await emailInput.type(EMAIL, { delay: 30 })
  await passInput.type(PASSWORD, { delay: 30 })

  const submitBtn = await page.$('button[type="submit"]') || await page.$('button:has-text("Sign In")')
  if (submitBtn) await submitBtn.click()

  // Wait for redirect to dashboard
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {})
  await new Promise(r => setTimeout(r, 3000))

  console.log(`Logged in. Current URL: ${page.url()}`)

  if (page.url().includes('login')) {
    console.error('Login failed - still on login page')
    await browser.close()
    process.exit(1)
  }

  // Take screenshots
  let success = 0
  let failed = 0

  for (const s of SCREENSHOTS) {
    try {
      console.log(`  Capturing ${s.page} -> ${s.file}...`)
      await page.goto(`${BASE_URL}${s.page}`, { waitUntil: 'networkidle2', timeout: 20000 })
      await new Promise(r => setTimeout(r, 2000)) // Extra wait for animations

      const filepath = path.join(OUTPUT_DIR, s.file)
      await page.screenshot({ path: filepath, type: 'jpeg', quality: 85 })
      success++
    } catch (err) {
      console.error(`  FAILED: ${s.page} - ${err.message}`)
      failed++
    }
  }

  console.log(`\nDone! ${success} captured, ${failed} failed.`)
  await browser.close()
}

main().catch(console.error)
