import { NextRequest, NextResponse } from 'next/server'
import { syncInvoice, syncExpense, syncInvoicePayment, syncExpensePayment } from '@/lib/accounting'

export async function POST(request: NextRequest) {
  try {
    const { entityType, entityIds } = await request.json()

    if (!entityType || !entityIds || !Array.isArray(entityIds)) {
      return NextResponse.json(
        { error: 'entityType and entityIds[] are required' },
        { status: 400 }
      )
    }

    const syncFn = {
      invoice: syncInvoice,
      expense: syncExpense,
      invoice_payment: syncInvoicePayment,
      expense_payment: syncExpensePayment,
    }[entityType]

    if (!syncFn) {
      return NextResponse.json(
        { error: `Unknown entity type: ${entityType}` },
        { status: 400 }
      )
    }

    const results: Array<{ id: string; status: string; error?: string }> = []

    for (const id of entityIds) {
      try {
        await syncFn(id)
        results.push({ id, status: 'synced' })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed'
        results.push({ id, status: 'failed', error: message })
      }
    }

    const succeeded = results.filter(r => r.status === 'synced').length
    const failed = results.filter(r => r.status === 'failed').length

    return NextResponse.json({
      success: true,
      total: entityIds.length,
      succeeded,
      failed,
      results,
    })
  } catch (error) {
    console.error('Batch sync error:', error)
    return NextResponse.json(
      { error: 'Batch sync failed' },
      { status: 500 }
    )
  }
}
