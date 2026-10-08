// ============================================
// After a supplier voucher goes out: mark it sent, on the server
// ============================================
// The voucher page used to send the email or WhatsApp and then make its own,
// separate PUT { status: 'sent' }, whose response nothing checked: a voucher
// could reach the supplier and stay "draft", with no error anywhere. The send
// routes now record it themselves, once the message has actually gone.
//
// Sending again records the latest send. It never moves a voucher backwards:
// one already confirmed or completed keeps that status.

type Db = {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

const ADVANCES_TO_SENT = ['draft', 'sent']

export async function markSupplierDocumentSent(
  db: Db,
  args: { documentId: string; orgId: string; via: 'email' | 'whatsapp'; now?: Date }
): Promise<{ error: string | null }> {
  const at = (args.now ?? new Date()).toISOString()
  const { data: row, error: readError } = await db
    .from('supplier_documents')
    .select('status')
    .eq('id', args.documentId)
    .eq('org_id', args.orgId)
    .maybeSingle()
  if (readError || !row) return { error: readError?.message ?? 'Document not found' }

  const update: Record<string, unknown> = { sent_at: at, sent_via: args.via, updated_at: at }
  if (ADVANCES_TO_SENT.includes(row.status ?? 'draft')) update.status = 'sent'

  const { error } = await db
    .from('supplier_documents')
    .update(update)
    .eq('id', args.documentId)
    .eq('org_id', args.orgId)
  return { error: error?.message ?? null }
}
