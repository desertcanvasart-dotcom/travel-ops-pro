import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function SupplierInvoicesPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Supplier Invoices</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Supplier Invoices</h1>
      <p className="text-gray-600 mb-8">
        Supplier Invoices, titled <strong>Bills</strong> on the screen, holds the invoices your suppliers send you. Each bill is matched to the expenses it covers, approved, and then paid, so you pay only what you actually owe. Open it from <strong>Home &rsaquo; Finance &rsaquo; Bills</strong>. Owners, admins and managers can see it; agents and viewers do not have it in their menu and cannot open the page.
      </p>

      {/* The list */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Bill List</h2>
        <p className="text-gray-600 mb-3">
          The table shows each bill&apos;s reference (SI-year-number), supplier, supplier invoice number, date, amount in the bill&apos;s own currency, a status badge and a match badge. Click a row to open it.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Status</strong> &mdash; Received, Matched, Approved, Paid, Disputed or Cancelled</li>
          <li><strong>Match</strong> &mdash; Unmatched, Partial, Matched or Discrepancy</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The four cards count all your bills and do not change with the filters: <strong>Total</strong> (every bill except cancelled ones), <strong>Unmatched</strong>, <strong>Awaiting Approval</strong> (status Matched) and <strong>Paid</strong>. Search by supplier, invoice number or reference; filter by status or match status to narrow the table.
        </p>
      </section>

      {/* Creating */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding a Bill</h2>
        <p className="text-gray-600 mb-3">
          Click <strong>New Supplier Invoice</strong>. You can fill the form by hand, or upload a PDF or photo (PDF, PNG, JPG, WebP or GIF, up to 20 MB) and let the AI read it. The AI fills in the invoice number, supplier, dates, currency, tax and line items. Check every field before saving; the AI can misread.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Currency</strong> starts as your company&apos;s currency. Choose USD, EUR, GBP, EGP or JPY to change it. If the AI finds a currency on the document it uses that one.</li>
          <li>The amount saved is the sum of the line items plus the tax.</li>
          <li>Picking a <strong>service category</strong> on a line fills its description, and fills the unit price from the supplier&apos;s rate only when that rate is in the bill&apos;s currency. A euro rate is never copied onto a dollar or yen bill.</li>
          <li>You can link the bill to a <strong>Related Itinerary</strong> and a <strong>Customer Invoice</strong>. This is set when you create the bill; there is no screen to change it afterwards.</li>
          <li>The bill records who created it from the account you are signed in with.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          <strong>The same invoice number from the same supplier cannot be entered twice.</strong> The supplier name is compared ignoring capitals and extra spaces. Saving it again is refused with a message such as &ldquo;Invoice INV-100 from Nile Hotels is already recorded (SI-2026-014)&rdquo;. A cancelled bill does not count, so cancelling a bill frees its number. The same number from a different supplier is fine.
        </p>
      </section>

      {/* Workflow */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Matching, Approving &amp; Paying</h2>
        <p className="text-gray-600 mb-3">Open a bill to move it along:</p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li><strong>Match Expense</strong> &mdash; Link the bill to expenses. The list offers only expenses from the same supplier, in the bill&apos;s currency, that are still Pending or Approved. A paid or rejected expense, or one from another supplier, is refused. The match is Matched when the linked amount equals the bill (within 0.01), Partial when it is less, Discrepancy when it is more. Only an exact match moves the bill to status Matched. You can remove a link while the bill is Received or Matched.</li>
          <li><strong>Approve</strong> &mdash; Available once the bill is Matched. The screen has no override button for a discrepancy.</li>
          <li><strong>Mark Paid</strong> &mdash; Available on an Approved bill. It asks for a payment method and an optional reference; the paid date is the time of the click. Paying marks a linked expense paid only when the amounts matched to paid bills cover the whole expense. An expense of 1,000 matched for 600 to this bill stays owed for the other 400.</li>
          <li><strong>Dispute</strong> &mdash; Flags a bill with a reason (shown in a red banner) while you sort it out with the supplier. A disputed bill cannot be matched, approved or paid. Click <strong>Resolve dispute</strong> to put it back to Matched (if its match is exact) or Received. An earlier approval is cleared, so it has to be approved again.</li>
          <li><strong>Cancel bill</strong> &mdash; For an Approved or Disputed bill that should not be paid (entered twice, or wrong). The bill stays on record as Cancelled, drops out of what you owe, releases its matched expenses and frees its invoice number.</li>
        </ol>
        <p className="text-gray-600 mt-3">
          The amount and currency of a bill cannot change once it is approved, disputed or paid.
        </p>
        <Tip>
          A <strong>Discrepancy</strong> match means the linked expenses add up to more than the bill. Sort it out before approving so you never overpay.
        </Tip>
      </section>

      {/* Delete */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Deleting a Bill</h2>
        <p className="text-gray-600">
          The trash icon appears on bills with status Received, Matched or Cancelled; deleting also removes their expense links. Approved, Disputed and Paid bills have no delete button, because they are a record of something decided. Cancel an approved or disputed bill instead. A paid bill stays on record.
        </p>
      </section>

      {/* Document */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Document</h2>
        <p className="text-gray-600">
          On a bill with no document you can upload one (PDF, JPG, PNG or WebP, up to 10 MB). It opens through a short-lived secure link. A document can be attached once; there is no replace or remove.
        </p>
      </section>

      {/* Payables link */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How Bills Show Up in Payables</h2>
        <p className="text-gray-600">
          A bill that is matched to an expense is counted through that expense. A Received, Matched or Approved bill with <em>no</em> expense behind it is listed on <Link href="/docs/accounts-payable" className="underline">Accounts Payable</Link> as an unmatched bill, so both screens agree on what you owe. Marking the last expense of an approved bill as paid on Payables marks the bill paid too.
        </p>
      </section>

      {/* Limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It does not pay a bill in part, and it does not handle credit notes. A negative amount is refused.</li>
          <li>It has no screen to edit a bill after saving, and none to change its trip or customer invoice link.</li>
          <li>It does not convert currencies; a bill can only be matched to expenses in its own currency.</li>
          <li>It does not move money. Mark Paid records a payment you made elsewhere.</li>
        </ul>
      </section>
    </div>
  )
}
