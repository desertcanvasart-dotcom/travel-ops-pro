import { createClient } from '@supabase/supabase-js'
import { AccountingProvider, AccountingAuthError, AccountingSyncError, SyncEntityType, AccountingProviderType } from './types'
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

  let accessToken = tokenData.access_token
  const refreshToken = tokenData.refresh_token
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
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token,
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

// Helper: find or get userId from any entity
async function getUserIdForEntity(entityType: SyncEntityType, entityId: string): Promise<string | null> {
  // For now, use the first active accounting token user
  // In production with multi-user, you'd look up the entity owner
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('accounting_tokens')
    .select('user_id')
    .eq('is_active', true)
    .limit(1)
    .single()
  return data?.user_id || null
}

// Helper: upsert sync log entry
async function upsertSyncLog(
  provider: AccountingProviderType,
  entityType: SyncEntityType,
  entityId: string,
  updates: Record<string, unknown>
) {
  const supabase = getSupabaseAdmin()

  const { data: existing } = await supabase
    .from('accounting_sync_log')
    .select('id')
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
        provider,
        entity_type: entityType,
        entity_id: entityId,
        ...updates,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
  }
}

// Helper: get cached external ID for a contact
async function getCachedContactId(
  provider: AccountingProviderType,
  contactKey: string
): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('accounting_sync_log')
    .select('external_id')
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
    let contactExternalId = await getCachedContactId(providerType, contactKey)

    if (!contactExternalId) {
      const contactPayload = mapClientToContact(invoice)
      const contactRef = await provider.upsertContact(contactPayload)
      contactExternalId = contactRef.id

      await upsertSyncLog(providerType, 'contact', contactKey, {
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

    await upsertSyncLog(providerType, 'invoice', invoiceId, {
      external_id: ref.id,
      external_number: ref.number,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      last_error: null,
      retry_count: 0,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const retryable = err instanceof AccountingSyncError ? err.retryable : true
    const isAuthError = err instanceof AccountingAuthError

    await upsertSyncLog(providerType, 'invoice', invoiceId, {
      sync_status: isAuthError ? 'skipped' : 'failed',
      last_error: message,
      retry_count: retryable ? undefined : 5, // Max out retries for non-retryable
    })

    throw err
  }
}

/**
 * Sync an expense as a bill to the connected accounting system.
 */
export async function syncExpense(expenseId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
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
    let vendorExternalId = await getCachedContactId(providerType, vendorKey)

    if (!vendorExternalId && expense.supplier_name) {
      const contactPayload = mapSupplierToContact(expense)
      const contactRef = await provider.upsertContact(contactPayload)
      vendorExternalId = contactRef.id

      await upsertSyncLog(providerType, 'contact', vendorKey, {
        external_id: contactRef.id,
        external_number: contactRef.number,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
      })
    }

    const { data: existingSync } = await supabase
      .from('accounting_sync_log')
      .select('external_id')
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

    await upsertSyncLog(providerType, 'expense', expenseId, {
      external_id: ref.id,
      external_number: ref.number,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      last_error: null,
      retry_count: 0,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await upsertSyncLog(providerType, 'expense', expenseId, {
      sync_status: 'failed',
      last_error: message,
    })
    throw err
  }
}

/**
 * Sync an invoice payment to the connected accounting system.
 */
export async function syncInvoicePayment(paymentId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
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

    await upsertSyncLog(providerType, 'invoice_payment', paymentId, {
      external_id: ref.id,
      external_number: ref.number,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      last_error: null,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await upsertSyncLog(providerType, 'invoice_payment', paymentId, {
      sync_status: 'failed',
      last_error: message,
    })
    throw err
  }
}

/**
 * Sync an expense payment (when expense status becomes 'paid').
 */
export async function syncExpensePayment(expenseId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
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
    const payload = mapExpensePaymentToPayload(expense, billExternalId)
    const ref = await provider.createPayment(payload)

    await upsertSyncLog(providerType, 'expense_payment', expenseId, {
      external_id: ref.id,
      external_number: ref.number,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
      last_error: null,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await upsertSyncLog(providerType, 'expense_payment', expenseId, {
      sync_status: 'failed',
      last_error: message,
    })
    throw err
  }
}

/**
 * Retry all failed syncs with exponential backoff.
 */
export async function retrySyncErrors(): Promise<{ retried: number; succeeded: number; failed: number }> {
  const supabase = getSupabaseAdmin()

  const { data: failedEntries } = await supabase
    .from('accounting_sync_log')
    .select('*')
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
