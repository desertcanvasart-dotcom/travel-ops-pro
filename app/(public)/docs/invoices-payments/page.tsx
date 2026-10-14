import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function InvoicesPaymentsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Invoices &amp; Payments</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Invoices &amp; Payments</h1>
      <p className="text-gray-600 mb-8">
        Open the list from <strong>Home &rsaquo; Finance &rsaquo; Invoices</strong>. The Finance section of the menu is shown to the owner, admins and managers; agents and viewers do not have it. An invoice can also be raised from a trip, which any staff member who can open the trip can do. Money recorded against invoices is also listed on <Link href="/docs/payments" className="text-primary-600 hover:underline">Payments</Link>, and each payment has a <Link href="/docs/receipts" className="text-primary-600 hover:underline">receipt</Link>.
      </p>

      {/* Viewing Invoices */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Invoices List</h2>
        <p className="text-gray-600 mb-3">
          The table shows invoice number, type, client, issue date, due date, total, balance due and status, newest first. Search by invoice number, client name or client email. Two filters narrow it: type (All Types, Standard, Deposit, Final) and status (All Status, Draft, Sent, Partial, Paid, Overdue, Cancelled).
        </p>
        <p className="text-gray-600 mb-3">
          <strong>Overdue</strong> is not a status you set. An invoice is shown as Overdue when it has been sent (Sent, Viewed or Partial), its due date is before today and a balance is still owed. A draft that was never sent is never Overdue. The Overdue filter and the Sent filter use the status the table shows, so an overdue invoice is found under Overdue and not under Sent.
        </p>
        <p className="text-gray-600 mb-3">The seven tiles above the table:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Total</strong>, <strong>Deposits</strong>, <strong>Finals</strong> &mdash; how many invoices of all, deposit and final type are loaded</li>
          <li><strong>Billed</strong> &mdash; the total of every invoice that is not a draft or cancelled, paid ones included</li>
          <li><strong>Paid</strong> &mdash; what has been paid against those invoices</li>
          <li><strong>Outstanding</strong> &mdash; the balance still owed on those invoices</li>
          <li><strong>Overdue</strong> &mdash; the balance of the overdue ones</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Billed, Paid, Outstanding and Overdue leave out drafts (not sent, so nothing is owed yet) and cancelled invoices. They are added up per currency: a company with yen and euro invoices sees both, for example <strong>¥450,000 + $500</strong>, never one mixed figure.
        </p>
        <p className="text-gray-600 mt-3">
          Row actions: <strong>View</strong>, <strong>Mark as sent</strong> (drafts only) and <strong>Delete</strong>. The <strong>CSV</strong> and <strong>PDF</strong> buttons export the rows currently shown.
        </p>
      </section>

      {/* Creating */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating an Invoice</h2>
        <p className="text-gray-600 mb-3">The easiest way is from a trip:</p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open the itinerary</li>
          <li>Click <strong>Generate Invoice</strong></li>
          <li>The invoice is created as a draft, with the trip&apos;s price and dates and its client</li>
        </ol>
        <p className="text-gray-600 mt-3">
          Or click <strong>New Invoice</strong> on the Invoices page: pick the client, optionally link a trip, choose the type, set the currency, add line items, a discount, dates, payment terms and notes. If you leave the currency empty the invoice takes the trip&apos;s currency, or else your company&apos;s default currency (Settings).
        </p>
        <p className="text-gray-600 mt-3">
          <strong>The amount comes from the trip, worked out by the server.</strong> For an invoice linked to a trip the server reads the trip&apos;s saved selling price, the figure the itinerary page shows (its priced service lines, each at its client price or at cost plus the default 25% margin, plus the season supplement; the stored trip total only when no line is priced). The price the browser sends is not used. A full (Standard) invoice bills that price, a Deposit invoice bills its percentage of it, and a Final invoice bills the price minus the deposit invoice it follows. When you pick a trip on New Invoice the form asks the server and shows the amount the invoice will bill. Confirmed insurance and extras are added by the server as described below, and VAT is worked out on the result.
        </p>
        <p className="text-gray-600 mt-3">The server checks what it is sent. These are refused:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>a negative or non-numeric total, trip cost or discount</li>
          <li>an invoice in a different currency than its trip, and a trip that has no price yet</li>
          <li>a discount on a trip invoice (a discount is a different amount; see the manual amount below)</li>
          <li>a deposit percentage of 0 or below, or above 100</li>
          <li>a second final invoice for a deposit invoice, and a second deposit invoice for a trip (a cancelled one does not count, so it can be replaced)</li>
          <li>a parent invoice that is not yours</li>
        </ul>
        <p className="text-gray-600 mt-3">
          For a trip with confirmed insurance or confirmed extras, the server adds them to a standard or final invoice itself (never to a deposit), and each extra is billed once. Insurance is priced in yen, so an invoice for such a trip in another currency is refused.
        </p>
        <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-2">Billing a different amount (manual amount)</h3>
        <p className="text-gray-600 mb-3">
          An <strong>admin</strong>, <strong>manager</strong> or the owner can bill an amount other than the one worked out from the trip. On New Invoice, change the amount (a line, or the discount) and a <strong>Reason for billing a different amount</strong> box appears; the reason is required. The invoice then records <strong>what the server worked out, the amount billed instead, the reason and who entered it</strong>. An amount equal to the server&apos;s is not an override. For a Deposit the manual amount replaces the deposit; the Final that follows still bills the trip price minus that deposit. For a Final it replaces the balance. Insurance and extras are still added on top.
        </p>
        <p className="text-gray-600 mb-3">
          <strong>Agents cannot do this.</strong> An agent can raise an invoice for a trip at the server&apos;s amount; if the amount is changed the form says so and the server refuses (403).
        </p>
        <p className="text-gray-600">
          An invoice that is not linked to a trip has nothing to work out from, so its amount is typed in: that is for an admin or manager only (an agent is refused) and the invoice records its source as a manual entry. A Final that follows a deposit with no trip bills the trip cost that deposit stored, less the deposit.
        </p>
        <Tip>
          Check the trip&apos;s price on the itinerary page before you generate the invoice: that is the price the invoice bills. Invoices made before this rule have no recorded source, and keep the amounts they have.
        </Tip>
      </section>

      {/* Invoice Types */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Invoice Types</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Standard</strong> &mdash; the full trip price in one invoice (the &quot;full&quot; invoice)</li>
          <li><strong>Deposit</strong> &mdash; a percentage of the trip price to confirm the booking. The default is <strong>10%</strong>; you can enter any percentage above 0 and up to 100. Insurance and extras are not part of the deposit</li>
          <li><strong>Final</strong> &mdash; the trip price minus the deposit invoice it follows (that deposit&apos;s actual amount, so a deposit billed as a manual amount, or a trip repriced since, is settled correctly), plus any confirmed insurance and extras</li>
        </ul>
      </section>

      {/* Numbering */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Invoice Numbers</h2>
        <p className="text-gray-600">
          Invoices are numbered <strong>INV-&lt;year&gt;-&lt;number&gt;</strong>, for example INV-2026-014, in a series that belongs to your company only: your numbers do not skip when another company using the app issues invoices, and the series starts again at 001 each year. A deposit invoice ends in <strong>-DEP</strong> and a final invoice in <strong>-FIN</strong>. Each is numbered on its own, so a deposit and its final do not share a number. Invoices issued before per-company numbering keep the numbers they have.
        </p>
      </section>

      {/* VAT */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">VAT</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>New Invoice has an <strong>Apply VAT</strong> box showing your company&apos;s rate (14% unless you changed it in Settings &rsaquo; Company Profile). It is off unless you tick it, or unless the trip you pick carries VAT from its quote.</li>
          <li>VAT is added on top of the invoice&apos;s net (subtotal minus discount), but not on extras or insurance: VAT = (net &minus; extras &minus; insurance) &times; your company&apos;s rate, rounded to the currency (whole yen for JPY). Total = net + VAT, so the premiums and extras are still billed, just not taxed.</li>
          <li>What is left out: the travellers&apos; confirmed insurance premiums and the confirmed extras and upgrades the app adds to a standard or final invoice for a trip, and, when the trip&apos;s own lines include Extra lines, that share of the rest of the invoice (an extra worth 10% of the trip leaves 10% of the trip amount out).</li>
          <li>When something was left out, the VAT line reads <strong>VAT 14% included: &lt;amount&gt; (extras and insurance not taxed)</strong>, and the invoice records the amount the VAT was charged on.</li>
          <li>The server works the VAT out; an amount sent by the browser is never stored. For an invoice that bills a trip, the form says VAT will be added on save, because the trip&apos;s extras and the confirmed insurance and extras are left out then. The amount shows on the saved invoice.</li>
          <li>A deposit invoice and its final invoice each carry VAT on their own part, so together they carry the VAT on the whole trip less its extras and insurance. A final invoice follows its deposit&apos;s VAT choice.</li>
          <li>On the invoice page you can switch VAT on or off until a payment has been recorded against it. After that the invoice keeps its VAT; issue a new invoice to change it.</li>
          <li>To change the amounts of an invoice that carries VAT through the API, switch VAT off first, change the amounts, then switch it on again; the server refuses a new total on an invoice with VAT because its tax would no longer match.</li>
          <li>The rate and amount are recorded on the invoice when it is issued. Invoices made before VAT existed that already carried a tax amount count as VAT applied, at the rate and amount they recorded. Invoices issued before extras and insurance were left out (13 October 2026) keep the VAT they recorded, on their whole net.</li>
          <li>The invoice page, the PDF, the WhatsApp message and payment reminder emails all state the VAT line, or <strong>VAT not applied</strong>.</li>
        </ul>
      </section>

      {/* Invoice Detail */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Invoice Detail Page</h2>
        <p className="text-gray-600 mb-3">Click an invoice to open it. The page shows:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Invoice number and status</li>
          <li>The client (Bill To), issue date and due date</li>
          <li>Line items with quantities, prices and totals, the discount and the VAT line</li>
          <li>For a deposit or final invoice, the trip cost breakdown and the link to the related deposit or final invoice</li>
          <li>Payment Summary: total, amount paid and balance due, with a progress bar</li>
          <li>Payment History, where each payment can be previewed or downloaded as a receipt, or deleted</li>
          <li>Reminder History: the reminders sent for this invoice and when</li>
        </ul>
      </section>

      {/* Invoice Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Invoice Actions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">Button</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-900 border-b border-gray-200">What it does</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Send via WhatsApp</td><td className="px-4 py-2.5">Sends the invoice to the client&apos;s WhatsApp number</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Preview PDF</td><td className="px-4 py-2.5">Builds the invoice PDF and opens a preview you can download</td></tr>
              <tr className="border-b border-gray-100"><td className="px-4 py-2.5 font-medium">Mark as Sent</td><td className="px-4 py-2.5">Drafts only. Changes the status to Sent; it does not send anything to the client</td></tr>
              <tr className="border-b border-gray-100 bg-gray-50/50"><td className="px-4 py-2.5 font-medium">Record Payment</td><td className="px-4 py-2.5">Records money received. Shown while a balance is owed on an invoice that is not a draft or cancelled</td></tr>
              <tr><td className="px-4 py-2.5 font-medium">Create Final Invoice</td><td className="px-4 py-2.5">On a paid deposit invoice that has no final invoice yet: creates the invoice for the remaining balance</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-gray-600 mt-3">
          There is no button to email an invoice or to send a reminder from the invoice page.
        </p>
      </section>

      {/* Recording Payment */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recording a Payment</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open the invoice (a draft must be marked as sent first)</li>
          <li>Click <strong>Record Payment</strong></li>
          <li>Enter:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li>Amount (it starts at the balance due)</li>
              <li>Currency (it is the invoice&apos;s; a payment in another currency is refused)</li>
              <li>Payment method (Bank Transfer, Credit Card, Cash, PayPal, Wise, Airwallex, Stripe)</li>
              <li>Payment date</li>
              <li>Transaction reference (optional)</li>
              <li>Notes (optional)</li>
            </ul>
          </li>
          <li>Save</li>
        </ol>
        <p className="text-gray-600 mt-3">
          <strong>Once a trip has an invoice, its money is recorded on the invoice.</strong> Money can be recorded on the trip (Payments &rsaquo; New Payment &rsaquo; Itinerary) or on an invoice, and counting both would count it twice. So a payment recorded on a trip that has a draft, sent, part-paid or paid invoice is refused, with a message pointing to the invoice; New Payment says the same and offers to record it on the invoice. A cancelled invoice does not count, so a trip whose only invoice is cancelled takes payments itself again.
        </p>
        <p className="text-gray-600 mt-3">
          A payment above the balance due is refused (<strong>Payment amount exceeds balance due</strong>), also when two people record one at the same moment. A draft or a cancelled invoice takes no payment. Each payment gets its own receipt number from your company&apos;s receipt series (see <Link href="/docs/receipts" className="text-primary-600 hover:underline">Receipts</Link>).
        </p>
        <Tip>
          The status follows the payments: part-paid becomes Partial and fully paid becomes Paid. It cannot be set to Paid, Partial or Overdue by hand.
        </Tip>
      </section>

      {/* Reminders */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Payment Reminders</h2>
        <p className="text-gray-600 mb-3">
          Reminders are emails to the client&apos;s address on the invoice. They are sent from the Reminders screen (one invoice, or all that are due at once) and by a daily job. Only Sent and Partial invoices with a balance, a due date and a client email are reminded; drafts, paid, cancelled and paused invoices are not.
        </p>
        <p className="text-gray-600">
          A new invoice is scheduled for its first reminder 7 days before its due date, and the daily job reminds it from then on, repeating every 7 days. Each reminder, sent or failed, is listed in Reminder History on the invoice.
        </p>
      </section>

      {/* Delete */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Deleting and Cancelling an Invoice</h2>
        <p className="text-gray-600 mb-3">
          Delete removes an invoice that has no payments. If payments are recorded against it the app refuses and tells you; delete the payments first if they were entered by mistake. When an invoice is deleted, the extras it billed become billable again on the next invoice for the trip.
        </p>
        <p className="text-gray-600 mb-3">
          <strong>Cancelling</strong> keeps the invoice on record with the status Cancelled (use <strong>Cancel invoice</strong> at the top of the invoice page, after a confirmation; it is not shown on an invoice that is already Cancelled or Paid). It releases the invoice&apos;s extras exactly as delete does, so they are billed on the next invoice. If money is recorded against the invoice the page shows the app&apos;s refusal message instead of cancelling, because that money would be left with no invoice: if the client was paid back (refunded), delete the payments from the invoice first, which is how a refund is recorded on an invoice, then cancel; if it was not refunded, leave the invoice as it is. A cancelled invoice cannot be reopened, because its extras may already be on another invoice; raise a new one. A cancelled invoice no longer blocks payments on its trip, or a new deposit or final.
        </p>
      </section>

      {/* Limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>It does not email invoices. Invoices go out on WhatsApp, or as a PDF you send yourself.</li>
          <li>It does not price a trip itself: it bills the trip&apos;s saved selling price. Change the price on the itinerary, not on the invoice (or use a manual amount, for an admin or manager).</li>
          <li>It does not work out an amount for an invoice that is not linked to a trip; that amount is typed in by an admin or manager.</li>
          <li>It does not convert currencies. An invoice, and the payments on it, stay in one currency, and a trip&apos;s invoice must be in the trip&apos;s currency.</li>
          <li>It does not move money between the two places by itself. A trip that was given payments directly before it had an invoice keeps them until someone presses <strong>Move to invoice</strong> on the Payments list (see Payments).</li>
        </ul>
      </section>
    </div>
  )
}
