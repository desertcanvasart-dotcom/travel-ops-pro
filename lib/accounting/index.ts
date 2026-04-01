import { AccountingProvider, AccountingProviderType } from './types'
import { XeroProvider } from './xero-provider'
import { QuickBooksProvider } from './quickbooks-provider'

export function getAccountingProvider(provider: AccountingProviderType): AccountingProvider {
  switch (provider) {
    case 'xero':
      return new XeroProvider()
    case 'quickbooks':
      return new QuickBooksProvider()
    default:
      throw new Error(`Unknown accounting provider: ${provider}`)
  }
}

export { XeroProvider } from './xero-provider'
export { QuickBooksProvider } from './quickbooks-provider'
export * from './types'
export * from './mappers'
export { syncInvoice, syncExpense, syncInvoicePayment, syncExpensePayment, getAuthenticatedProvider, retrySyncErrors } from './sync-service'
