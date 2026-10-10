import { NextRequest, NextResponse } from 'next/server'
import { syncInvoice, syncExpense, syncInvoicePayment, syncExpensePayment, getOrgIdForEntity } from '@/lib/accounting'
import type { SyncEntityType } from '@/lib/accounting/types'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'

export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const { entityType, entityId } = await request.json()

    if (!entityType || !entityId) {
      return NextResponse.json(
        { error: 'entityType and entityId are required' },
        { status: 400 }
      )
    }

    const known = ['invoice', 'expense', 'invoice_payment', 'expense_payment']
    if (!known.includes(entityType)) {
      return NextResponse.json(
        { error: `Unknown entity type: ${entityType}` },
        { status: 400 }
      )
    }
    // The sync helpers resolve the org from the entity itself, so without this
    // a caller could push ANOTHER org's invoice into that org's ledger just by
    // knowing its id. Same 404 for "missing" and "not yours" — no existence leak.
    const entityOrgId = await getOrgIdForEntity(entityType as SyncEntityType, entityId)
    if (!entityOrgId || entityOrgId !== orgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    switch (entityType) {
      case 'invoice':
        await syncInvoice(entityId)
        break
      case 'expense':
        await syncExpense(entityId)
        break
      case 'invoice_payment':
        await syncInvoicePayment(entityId)
        break
      case 'expense_payment':
        await syncExpensePayment(entityId)
        break
      default:
        return NextResponse.json(
          { error: `Unknown entity type: ${entityType}` },
          { status: 400 }
        )
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sync failed'
    console.error('Sync error:', error)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
