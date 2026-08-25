import { createClient } from '@supabase/supabase-js'
import { decryptToken, encryptToken } from '@/lib/crypto/token-cipher'
import { AccountingProvider, AccountingAuthError, AccountingSyncError, AccountingConfigError, SyncEntityType, AccountingProviderType } from './types'
import { XeroProvider } from './xero-provider'
import { QuickBooksProvider } from './quickbooks-provider'
import {
  mapInvoiceToPayload,
  mapExpenseToBillPayload,
  mapInvoicePaymentToPayload,
  mapExpensePaymentToPayload,
  mapClientToContact,
  mapSupplierToContact,
} from './mappers'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Get an authenticated accounting provider for a user.
 * Handles: token fetch -> expiry check -> refresh -> DB update.
 * Follows the same pattern as getAuthenticatedGmail in lib/gmail.ts.
 */
export async function getAuthenticatedProvider(userId: string): Promise<{
  provider: AccountingProvider
  providerType: AccountingProviderType
} | null> {
  const supabase = getSupabaseAdmin()

  const { data: tokenData, error } = await supabase
    .from('accounting_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .single()

  if (error || !tokenData) {
    return null // No accounting connected
  }

  let accessToken = decryptToken(tokenData.access_token) as string
  const refreshToken = decryptToken(tokenData.refresh_token) as string
  const providerType = tokenData.provider as AccountingProviderType

  // Check if token is expired and refresh if needed
  if (tokenData.token_expiry && new Date(tokenData.token_expiry) <= new Date()) {
    let providerInstance: AccountingProvider
    if (providerType === 'xero') {
      providerInstance = new XeroProvider()
    } else {
      providerInstance = new QuickBooksProvider()
    }

    try {
      const newTokens = await providerInstance.refreshTokens(refreshToken)
      accessToken = newTokens.access_token

      await supabase
        .from('accounting_tokens')
        .update({
          access_token: encryptToken(newTokens.access_token),
          refresh_token: encryptToken(newTokens.refresh_token),
          token_expiry: new Date(newTokens.expiry_date).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', tokenData.id)
    } catch (err) {
      // Mark token as inactive on refresh failure
      await supabase
        .from('accounting_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', tokenData.id)

      throw new AccountingAuthError('Failed to refresh accounting token. Please reconnect.')
    }
  }

  // Create authenticated provider instance
  let provider: AccountingProvider
  if (providerType === 'xero') {
    const xero = new XeroProvider()
    xero.setCredentials(accessToken, tokenData.tenant_id || '')
    provider = xero
  } else {
    const qb = new QuickBooksProvider()
    qb.setCredentials(accessToken, tokenData.realm_id || '')
    provider = qb
  }

  return { provider, providerType }
}

// M3 Phase 1: resolve the user_id whose accounting connection should
// receive THIS entity's sync. The prior implementation returned the user
// from the first active accounting_tokens row regardless of which entity
// was being synced — in a multi-user deployment that crossed tenants and
// pushed one user's invoices into another's QuickBooks/Xero.
//
// The new resolution chain is:
//   entity → owning user (via created_by where the column exists) →
//   user's org (via organization_members) →
//   accounting_tokens.user_id where org_id matches AND is_active.
//
// In the current single-tenant deployment (one user, one org bound by the
// 20260624_organizations_phase1 backfill) the chain collapses to the same
// token that was always returned, so behavior is unchanged for today.
// Once a second org is connected, the resolver routes each entity's sync
// to the right account.
//
// Phase 2 will add created_by columns to every financial entity (only
// supplier_invoices has one today) AND an entity-level org_id, at which
// point the resolver short-circuits at the entity layer without joining
// through users at all.
async function getUserIdForEntity(entityType: SyncEntityType, entityId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin()

  // Step 1: resolve the entity's owning user where the column exists.
  // Tables that don't have created_by today fall through to the singleton
  // fallback below — correct for the current 1-user / 1-org deployment.
  let owningUserId: string | null = null
  if (entityType === 'invoice') {
    const { data } = await supabase
      .from('invoices')
      .select('created_by')
      .eq('id', entityId)
      .maybeSingle()
    owningUserId = (data as { created_by?: string } | null)?.created_by ?? null
  } else if (entityType === 'expense') {
    const { data } = await supabase
      .from('expenses')
      .select('created_by')
      .eq('id', entityId)
      .maybeSingle()
    owningUserId = (data as { created_by?: string } | null)?.created_by ?? null
  } else if (entityType === 'invoice_payment') {
    // Payments don't carry created_by themselves; walk to the parent invoice.
    const { data: payment } = await supabase
      .from('invoice_payments')
      .select('invoice_id')
      .eq('id', entityId)
      .maybeSingle()
    const invoiceId = (payment as { invoice_id?: string } | null)?.invoice_id
    if (invoiceId) {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('created_by')
        .eq('id', invoiceId)
        .maybeSingle()
      owningUserId = (invoice as { created_by?: string } | null)?.created_by ?? null
    }
  } else if (entityType === 'expense_payment') {
    const { data } = await supabase
      .from('expenses')
      .select('created_by')
      .eq('id', entityId)
      .maybeSingle()
    owningUserId = (data as { created_by?: string } | null)?.created_by ?? null
  }

  // Step 2: resolve owning user → org_id via organization_members.
  let orgId: string | null = null
  if (owningUserId) {
    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', owningUserId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    orgId = (membership as { org_id?: string } | null)?.org_id ?? null
  }

  // Step 3: fallback — singleton-org assumption from the migration backfill.
  // This preserves prior behavior for tables that don't yet carry the
  // owning user (Phase 2 fixes this for good).
  if (!orgId) {
    const { data: defaultOrg } = await supabase
      .from('organizations')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    orgId = (defaultOrg as { id?: string } | null)?.id ?? null
  }

  if (!orgId) return null

  // Step 4: pick the active accounting token bound to that org and return
  // its user_id (existing getAuthenticatedProvider() keys on user_id, so
  // this preserves its contract).
  const { data: token } = await supabase
    .from('accounting_tokens')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (token as { user_id?: string } | null)?.user_id ?? null
}

// M3 Phase 2A: resolve the org_id for an entity being synced. Unlike
// getUserIdForEntity (which routes the entity to the right accounting
// token via owning user → org → token), this returns the org_id directly
// from the financial root table now that every such table carries
// org_id. Sync code uses this to scope accounting_sync_log reads/writes
// so two orgs' syncs of the same entity_id never collide.
async function getOrgIdForEntity(entityType: SyncEntityType, entityId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin()

  if (entityType === 'invoice') {
    const { data } = await supabase
      .from('invoices')
      .select('org_id')
      .eq('id', entityId)
      .maybeSingle()
    return (data as { org_id?: string } | null)?.org_id ?? null
  }
  if (entityType === 'expense' || entityType === 'expense_payment') {
    // expense_payment uses the expense's id as entityId (see syncExpensePayment).
    const { data } = await supabase
      .from('expenses')
      .select('org_id')
      .eq('id', entityId)
      .maybeSingle()
    return (data as { org_id?: string } | null)?.org_id ?? null
  }
  if (entityType === 'invoice_payment') {
    // Payments don't carry org_id themselves; walk to the parent invoice.
    const { data: payment } = await supabase
      .from('invoice_payments')
      .select('invoice_id')
      .eq('id', entityId)
      .maybeSingle()
    const invoiceId = (payment as { invoice_id?: string } | null)?.invoice_id
    if (!invoiceId) return null
    const { data: invoice } = await supabase
      .from('invoices')
      .select('org_id')
      .eq('id', invoiceId)
      .maybeSingle()
    return (invoice as { org_id?: string } | null)?.org_id ?? null
  }
  return null
}

/**
 * Is this failure worth trying again?
 *
 * AccountingSyncError and AccountingConfigError (audit M4) both declare an
 * explicit `retryable`; anything else is assumed transient. Callers max out
 * retry_count on a non-retryable failure so `retrySyncErrors`'
 * `.lt('retry_count', 5)` filter skips it — re-posting a bill to an
 * unconfigured ledger account fails identically every time, and the retry
 * queue is not where an operator should discover an env var is missing.
 */
function isRetryable(err: unknown): boolean {
  if (err instanceof AccountingSyncError) return err.retryable
  if (err instanceof AccountingConfigError) return err.retryable
  return true
}

// Helper: upsert sync log entry. orgId scopes both the lookup (so two
// orgs syncing the same entity_id don't collide on the unique check)
// and the INSERT (so new rows are stamped with the right tenant).
async function upsertSyncLog(
  provider: AccountingProviderType,
  entityType: SyncEntityType,
  entityId: string,
  orgId: string,
  updates: Record<string, unknown>
) {
  const supabase = getSupabaseAdmin()

  const { data: existing } = await supabase
    .from('accounting_sync_log')
    .select('id')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .single()

  if (existing) {
    await supabase
      .from('accounting_sync_log')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('accounting_sync_log')
      .insert({
        org_id: orgId,
        provider,
        entity_type: entityType,
        entity_id: entityId,
        ...updates,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
  }
}

// Helper: get cached external ID for a contact, scoped to org.
async function getCachedContactId(
  provider: AccountingProviderType,
  orgId: string,
  contactKey: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('accounting_sync_log')
    .select('external_id')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .eq('entity_type', 'contact')
    .eq('entity_id', contactKey)
    .eq('sync_status', 'synced')
    .single()
  return data?.external_id || null
}

/**
 * Sync an invoice to the connected accounting system.
 */
export async function syncInvoice(invoiceId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const orgId = await getOrgIdForEntity('invoice', invoiceId)
  if (!orgId) return // Entity has no org, shouldn't sync
  const userId = await getUserIdForEntity('invoice', invoiceId)
  if (!userId) return

  const auth = await getAuthenticatedProvider(userId)
  if (!auth) return // No accounting connected

  const { provider, providerType } = auth

  try {
    // Fetch invoice data
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single()

    if (error || !invoice) {
      throw new AccountingSyncError(`Invoice ${invoiceId} not found`)
    }

    // Upsert contact first
    const contactKey = invoice.client_id || invoice.client_name
    let contactExternalId = await getCachedContactId(providerType, orgId, contactKey)

    if (!contactExternalId) {
      const contactPayload = mapClientToContact(invoice)
      const contactRef = await provider.upsertContact(contactPayload)
      contactExternalId = contactRef.id

      await upsertSyncLog(providerType, 'contact', contactKey, orgId, {
        external_id: contactRef.id,
        external_number: contactRef.number,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
      })
    }

    // Check if already synced
    const { data: existingSync } = await supabase
      .from('accounting_sync_log')
      .select('external_id')
      .eq('org_id', orgId)
      .eq('provider', providerType)
      .eq('entity_type', 'invoice')
      .eq('entity_id', invoiceId)
      .eq('sync_status', 'synced')
      .single()

    const payload = mapInvoiceToPayload(invoice)
    payload.contactExternalId = contactExternalId || undefined

    let ref
    if (existingSync?.external_id) {
      ref = await provider.updateInvoice(existingSync.external_id, payload)
    } else {
      ref = await provider.createInvoice(payload)
    }

    await upsertSyncLog(providerType, 'invoice', invoiceId, orgId, {
      external_id: ref.id,
      external_number: ref.number,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      last_error: null,
      retry_count: 0,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const isAuthError = err instanceof AccountingAuthError

    await upsertSyncLog(providerType, 'invoice', invoiceId, orgId, {
      sync_status: isAuthError ? 'skipped' : 'failed',
      last_error: message,
      retry_count: isRetryable(err) ? undefined : 5, // Max out retries for non-retryable
    })

    throw err
  }
}

/**
 * Sync an expense as a bill to the connected accounting system.
 */
export async function syncExpense(expenseId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const orgId = await getOrgIdForEntity('expense', expenseId)
  if (!orgId) return
  const userId = await getUserIdForEntity('expense', expenseId)
  if (!userId) return

  const auth = await getAuthenticatedProvider(userId)
  if (!auth) return

  const { provider, providerType } = auth

  try {
    const { data: expense, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', expenseId)
      .single()

    if (error || !expense) {
      throw new AccountingSyncError(`Expense ${expenseId} not found`)
    }

    // Upsert vendor contact
    const vendorKey = expense.supplier_id || expense.supplier_name || 'unknown'
    let vendorExternalId = await getCachedContactId(providerType, orgId, vendorKey)

    if (!vendorExternalId && expense.supplier_name) {
      const contactPayload = mapSupplierToContact(expense)
      const contactRef = await provider.upsertContact(contactPayload)
      vendorExternalId = contactRef.id

      await upsertSyncLog(providerType, 'contact', vendorKey, orgId, {
        external_id: contactRef.id,
        external_number: contactRef.number,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
      })
    }

    const { data: existingSync } = await supabase
      .from('accounting_sync_log')
      .select('external_id')
      .eq('org_id', orgId)
      .eq('provider', providerType)
      .eq('entity_type', 'expense')
      .eq('entity_id', expenseId)
      .eq('sync_status', 'synced')
      .single()

    const payload = mapExpenseToBillPayload(expense)
    payload.vendorExternalId = vendorExternalId || undefined

    let ref
    if (existingSync?.external_id) {
      ref = await provider.updateBill(existingSync.external_id, payload)
    } else {
      ref = await provider.createBill(payload)
    }

    await upsertSyncLog(providerType, 'expense', expenseId, orgId, {
      external_id: ref.id,
      external_number: ref.number,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      last_error: null,
      retry_count: 0,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await upsertSyncLog(providerType, 'expense', expenseId, orgId, {
      sync_status: 'failed',
      last_error: message,
      retry_count: isRetryable(err) ? undefined : 5,
    })
    throw err
  }
}

/**
 * Sync an invoice payment to the connected accounting system.
 */
export async function syncInvoicePayment(paymentId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const orgId = await getOrgIdForEntity('invoice_payment', paymentId)
  if (!orgId) return
  const userId = await getUserIdForEntity('invoice_payment', paymentId)
  if (!userId) return

  const auth = await getAuthenticatedProvider(userId)
  if (!auth) return

  const { provider, providerType } = auth

  try {
    const { data: payment, error } = await supabase
      .from('invoice_payments')
      .select('*')
      .eq('id', paymentId)
      .single()

    if (error || !payment) {
      throw new AccountingSyncError(`Invoice payment ${paymentId} not found`)
    }

    // Idempotency: if this payment was already created in the accounting system,
    // do not create it again — retries must never double-create a payment.
    const { data: existingPaymentSync } = await supabase
      .from('accounting_sync_log')
      .select('external_id')
      .eq('org_id', orgId)
      .eq('provider', providerType)
      .eq('entity_type', 'invoice_payment')
      .eq('entity_id', paymentId)
      .eq('sync_status', 'synced')
      .single()
    if (existingPaymentSync?.external_id) return

    // Find synced invoice external ID
    const { data: invoiceSync } = await supabase
      .from('accounting_sync_log')
      .select('external_id')
      .eq('org_id', orgId)
      .eq('provider', providerType)
      .eq('entity_type', 'invoice')
      .eq('entity_id', payment.invoice_id)
      .eq('sync_status', 'synced')
      .single()

    let invoiceExternalId = invoiceSync?.external_id || ''

    if (!invoiceExternalId) {
      // Invoice not synced yet, sync it first
      await syncInvoice(payment.invoice_id)
      // Re-fetch the freshly-synced invoice's external id
      const { data: reSync } = await supabase
        .from('accounting_sync_log')
        .select('external_id')
        .eq('org_id', orgId)
        .eq('provider', providerType)
        .eq('entity_type', 'invoice')
        .eq('entity_id', payment.invoice_id)
        .eq('sync_status', 'synced')
        .single()

      if (!reSync?.external_id) {
        throw new AccountingSyncError('Cannot sync payment: invoice sync failed')
      }
      invoiceExternalId = reSync.external_id
    }
    const payload = mapInvoicePaymentToPayload(payment, invoiceExternalId)
    const ref = await provider.createPayment(payload)

    await upsertSyncLog(providerType, 'invoice_payment', paymentId, orgId, {
      external_id: ref.id,
      external_number: ref.number,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      last_error: null,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await upsertSyncLog(providerType, 'invoice_payment', paymentId, orgId, {
      sync_status: 'failed',
      last_error: message,
      retry_count: isRetryable(err) ? undefined : 5,
    })
    throw err
  }
}

/**
 * Sync an expense payment (when expense status becomes 'paid').
 */
export async function syncExpensePayment(expenseId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const orgId = await getOrgIdForEntity('expense_payment', expenseId)
  if (!orgId) return
  const userId = await getUserIdForEntity('expense_payment', expenseId)
  if (!userId) return

  const auth = await getAuthenticatedProvider(userId)
  if (!auth) return

  const { provider, providerType } = auth

  try {
    const { data: expense, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', expenseId)
      .single()

    if (error || !expense || expense.status !== 'paid') return

    // Idempotency: skip if this expense payment was already created.
    const { data: existingExpensePaymentSync } = await supabase
      .from('accounting_sync_log')
      .select('external_id')
      .eq('org_id', orgId)
      .eq('provider', providerType)
      .eq('entity_type', 'expense_payment')
      .eq('entity_id', expenseId)
      .eq('sync_status', 'synced')
      .single()
    if (existingExpensePaymentSync?.external_id) return

    // Find synced bill external ID
    const { data: billSync } = await supabase
      .from('accounting_sync_log')
      .select('external_id')
      .eq('org_id', orgId)
      .eq('provider', providerType)
      .eq('entity_type', 'expense')
      .eq('entity_id', expenseId)
      .eq('sync_status', 'synced')
      .single()

    let billExternalId = billSync?.external_id || ''

    if (!billExternalId) {
      await syncExpense(expenseId)
      // Re-fetch the freshly-synced bill's external id
      const { data: reSync } = await supabase
        .from('accounting_sync_log')
        .select('external_id')
        .eq('org_id', orgId)
        .eq('provider', providerType)
        .eq('entity_type', 'expense')
        .eq('entity_id', expenseId)
        .eq('sync_status', 'synced')
        .single()
      if (!reSync?.external_id) {
        throw new AccountingSyncError('Cannot sync expense payment: expense sync failed')
      }
      billExternalId = reSync.external_id
    }
    // M4: the AP payment names the VENDOR, not the bill. syncExpense already
    // upserted this contact (it had to, to create the bill), so the cache is
    // populated by the time we get here — via syncExpense above if it wasn't.
    const vendorKey = expense.supplier_id || expense.supplier_name || 'unknown'
    const vendorExternalId = await getCachedContactId(providerType, orgId, vendorKey)

    const payload = mapExpensePaymentToPayload(expense, billExternalId, vendorExternalId || undefined)
    const ref = await provider.createPayment(payload)

    await upsertSyncLog(providerType, 'expense_payment', expenseId, orgId, {
      external_id: ref.id,
      external_number: ref.number,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      last_error: null,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await upsertSyncLog(providerType, 'expense_payment', expenseId, orgId, {
      sync_status: 'failed',
      last_error: message,
      retry_count: isRetryable(err) ? undefined : 5,
    })
    throw err
  }
}

/**
 * Retry all failed syncs with exponential backoff.
 */
export async function retrySyncErrors(orgId: string): Promise<{ retried: number; succeeded: number; failed: number }> {
  const supabase = getSupabaseAdmin()

  const { data: failedEntries } = await supabase
    .from('accounting_sync_log')
    .select('*')
    .eq('org_id', orgId)
    .eq('sync_status', 'failed')
    .lt('retry_count', 5)
    // Include rows whose next_retry_at is NULL (newly-failed entries) as well as
    // those whose backoff window has elapsed — otherwise new failures never retry.
    .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(50)

  if (!failedEntries || failedEntries.length === 0) {
    return { retried: 0, succeeded: 0, failed: 0 }
  }

  let succeeded = 0
  let failed = 0

  for (const entry of failedEntries) {
    try {
      switch (entry.entity_type) {
        case 'invoice':
          await syncInvoice(entry.entity_id)
          break
        case 'expense':
          await syncExpense(entry.entity_id)
          break
        case 'invoice_payment':
          await syncInvoicePayment(entry.entity_id)
          break
        case 'expense_payment':
          await syncExpensePayment(entry.entity_id)
          break
      }
      succeeded++
    } catch {
      // Update retry count and next_retry_at with exponential backoff
      const newRetryCount = (entry.retry_count || 0) + 1
      const backoffMinutes = Math.pow(2, newRetryCount)
      const nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000)

      await supabase
        .from('accounting_sync_log')
        .update({
          retry_count: newRetryCount,
          next_retry_at: nextRetry.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry.id)

      failed++
    }
  }

  return { retried: failedEntries.length, succeeded, failed }
}
