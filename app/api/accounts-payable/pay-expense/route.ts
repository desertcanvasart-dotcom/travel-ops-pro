import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentOrgId, noOrgResponse } from '@/lib/auth/current-org'
import { paymentDateForStatus } from '@/lib/expense-status'
import { payExpenseAndSettleBills } from '@/lib/finance/payables'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST - Mark an expense paid from Payables. Unlike a bare status change on the
// expense, this also settles the supplier bill the expense is matched to once
// all of that bill's expenses are paid; otherwise the bill stayed 'approved',
// still owed on the Bills screen and the dashboard, and could be paid again.
export async function POST(request: NextRequest) {
  try {
    const orgId = await getCurrentOrgId()
    if (!orgId) return noOrgResponse()

    const body = await request.json().catch(() => ({}))
    if (!body.expenseId || typeof body.expenseId !== 'string') {
      return NextResponse.json({ error: 'expenseId is required' }, { status: 400 })
    }

    const result = await payExpenseAndSettleBills(supabaseAdmin, orgId, body.expenseId, {
      payment_date: paymentDateForStatus('paid', body.payment_date, null) ?? new Date().toISOString().slice(0, 10),
      payment_method: body.payment_method,
      payment_reference: body.payment_reference,
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    return NextResponse.json({ success: true, data: result.expense, bills_paid: result.bills_paid })
  } catch (error) {
    console.error('Error in accounts-payable pay-expense:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
