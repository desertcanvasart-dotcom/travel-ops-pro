import { NextRequest, NextResponse } from 'next/server'
import { syncInvoice, syncExpense, syncInvoicePayment, syncExpensePayment } from '@/lib/accounting'
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
