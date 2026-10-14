import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function ReceiptsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Receipts</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Receipts</h1>
      <p className="text-gray-600 mb-8">
        Open it from <strong>Home &rsaquo; Finance &rsaquo; Receipts</strong>. Receipts is shown to the owner, admins and managers; agents and viewers do not have it in their menu and cannot open the page. The page lists a receipt for each payment that has been received, to preview, download and send. Receipts are made from payments; you never create one by hand.
      </p>

      {/* Where receipts come from */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What Gets a Receipt</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Invoice payments</strong> &mdash; every payment recorded against a client invoice (blue badge)</li>
          <li><strong>Itinerary payments</strong> &mdash; payments recorded directly on a trip, but only those with the status <strong>Completed</strong> (purple badge). A pending, failed or refunded payment has no receipt, and neither does a payment of the type refund: a refund is money handed back. If a trip payment&apos;s page is opened anyway, it offers no PDF and no WhatsApp.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The tiles at the top: <strong>Total Receipts</strong> (how many are listed), <strong>Total Received</strong> (their amounts, added up per currency, for example <strong>¥450,000 + $500</strong>; currencies are never added together) and <strong>Received This Month</strong> (how many receipts have a payment date in the current month). They follow the search box.
        </p>
        <p className="text-gray-600 mt-3">
          <strong>A trip is never counted twice.</strong> Once a trip has an invoice that is not cancelled, its money is recorded on the invoice (see <Link href="/docs/payments" className="text-primary-600 hover:underline">Payments</Link>). A trip payment recorded on such a trip before that rule is still listed, marked <strong>Trip has an invoice (counted on the invoice)</strong> (in the app&apos;s language), and its receipt still opens, but the three tiles count only the invoice&apos;s payments for that trip.
        </p>
      </section>

      {/* Numbers */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Receipt Numbers</h2>
        <p className="text-gray-600 mb-3">
          Every receipt has its own number, <strong>RCP-&lt;year&gt;-&lt;number&gt;</strong> (for example RCP-2026-0042), from a series that belongs to your company. It is one series for invoice payments and trip payments together, and it does not skip when another company using the app issues receipts. A payment gets its number when it is recorded (an invoice payment) or when it becomes Completed (a trip payment).
        </p>
        <p className="text-gray-600">
          The transaction reference is not the receipt number: two payments can share a bank reference and still have different receipts. The reference is shown on its own line under the number, and printed on the PDF as <strong>Transaction Ref</strong>. Payments made before receipt numbers existed were numbered when they were introduced, oldest first: a payment whose transaction reference was unique in your company keeps that reference as its number (it is what the receipt already showed), and the others were given numbers from the series. A payment that has no number yet (a pending trip payment) shows an RCP- code made from its id until it is completed.
        </p>
      </section>

      {/* Finding receipts */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Finding a Receipt</h2>
        <p className="text-gray-600 mb-3">
          Search by client name, reference (invoice number or trip code) or transaction reference. The table lists the receipt number, source, client, date, payment method and amount, newest first. There is no date or method filter.
        </p>
      </section>

      {/* Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewing, Downloading &amp; Sending</h2>
        <p className="text-gray-600 mb-3">
          Each receipt has three actions:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li><strong>View</strong> &mdash; opens the receipt page (for a trip payment) or the invoice (for an invoice payment)</li>
          <li><strong>Preview PDF</strong> &mdash; builds the receipt PDF on the spot and opens a preview you can download</li>
          <li><strong>Send via WhatsApp</strong> &mdash; sends the receipt to the client. For a trip payment the button is unavailable when the trip has no phone number; for an invoice payment the app looks for the client&apos;s phone number, then the trip&apos;s</li>
        </ol>
        <p className="text-gray-600 mt-3">
          Receipts go out on WhatsApp only; there is no email option. The <strong>CSV</strong> and <strong>PDF</strong> buttons in the header export the list (receipt number, invoice or trip reference, client, amount, date, method).
        </p>
      </section>

      {/* VAT */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">VAT</h2>
        <p className="text-gray-600">
          Every receipt states the VAT inside the amount received, or <strong>VAT not applied</strong>. For a payment
          against an invoice it is that payment&apos;s share of the VAT the invoice recorded (half the invoice paid,
          half its VAT). For a payment recorded on a trip it is the VAT inside the amount at the trip&apos;s rate,
          worked out and recorded on the payment when it was saved, so a receipt reprints with the VAT it was sent
          with even if the trip&apos;s VAT setting changes later. (Trip payments saved before this was recorded still
          read the trip&apos;s current VAT.) The receipt page, the PDF and the WhatsApp receipt all show it.
        </p>
        <p className="text-gray-600 mt-3">
          Extras and insurance carry no VAT. An invoice that left them out recorded less VAT, so its receipts carry
          their share of that, and say <strong>VAT 14% included: &lt;amount&gt; (extras and insurance not taxed)</strong>.
          For a trip payment, when the trip has Extra lines, only the taxed share of the payment bears VAT.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Receipt PDF</h2>
        <p className="text-gray-600 mb-3">
          The PDF has your company&apos;s letterhead, the receipt number, the invoice or trip reference, the client, the payment date, the method, the amount, the transaction reference, any notes and the VAT line.
        </p>
        <Tip>
          If a trip has no phone number on file, the WhatsApp button stays unavailable &mdash; add the client&apos;s phone to the trip or their record to send receipts.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>It does not email receipts.</li>
          <li>It does not merge two receipts for the same money. A trip that has both a trip payment and an invoice payment for it (recorded before the one-place rule) has two receipts; the tiles count only the invoice&apos;s, but the older receipt is not removed. Moving the trip payment onto the invoice from the Payments list removes the trip payment and its receipt.</li>
          <li>It does not convert currencies; each receipt is in its payment&apos;s own currency.</li>
          <li>It does not issue receipts for refunds.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          See <Link href="/docs/payments" className="text-primary-600 hover:underline">Payments</Link> for recording the payments receipts are made from.
        </p>
      </section>
    </div>
  )
}
