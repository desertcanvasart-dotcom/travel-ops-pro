import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function AccountsReceivablePage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Accounts Receivable</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Accounts Receivable</h1>
      <p className="text-gray-600 mb-8">
        Accounts Receivable lists the invoices your clients still owe you, groups them by client, and ages each one by how many days it is past its due date. Open it from <strong>Home &rsaquo; Finance &rsaquo; Receivables</strong>. Owners, admins and managers can see it; agents and viewers do not have it in their menu and cannot open the page.
      </p>

      {/* What is listed */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What Is Listed</h2>
        <p className="text-gray-600 mb-3">
          Every invoice of your company that has a balance due and has been sent. These are left out:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Draft</strong> invoices &mdash; a draft has not been sent to the client, so it is not owed yet. It appears here once you send it.</li>
          <li><strong>Cancelled</strong> and void invoices, and invoices with nothing left to pay.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The page reads all open invoices, not just the first thousand. If a company ever has more than 50,000 open invoices, a yellow banner says the figures are incomplete.
        </p>
      </section>

      {/* Due date */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How the Due Date Is Worked Out</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>If the invoice has a <strong>due date</strong>, that date is used.</li>
          <li>If it has none, the due date is the <strong>issue date plus the number of days in its payment terms</strong> (for example &ldquo;Payment due within 30 days&rdquo; or &ldquo;Net 30&rdquo;). Terms with no number count as 14 days. The row shows &ldquo;(from terms)&rdquo; next to the date.</li>
          <li>If it has neither a due date nor an issue date, the invoice is shown as <strong>No due date</strong>. It counts in Total Outstanding, but it is not treated as overdue and sits in no age bucket.</li>
        </ol>
        <p className="text-gray-600 mt-3">
          <strong>Days past due</strong> is today minus the due date, in calendar days. An invoice due today is not late.
        </p>
      </section>

      {/* Summary & Aging */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Summary &amp; Aging Report</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Total Outstanding</strong> &mdash; The sum of the balance due on every listed invoice, with the number of invoices</li>
          <li><strong>Overdue</strong> &mdash; The balance and count of invoices past their due date</li>
          <li><strong>Current</strong> &mdash; Balance due today or later</li>
          <li><strong>1&ndash;30 Days</strong>, <strong>31&ndash;60 Days</strong>, <strong>61&ndash;90 Days</strong> &mdash; Balance that many days past due</li>
          <li><strong>90+ Days</strong> &mdash; Balance more than 90 days past due</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The age badge on each invoice, the tiles, the aging bar and the Aging filter all use the same cut-offs, so an invoice 75 days late is badged 61&ndash;90 Days, counted in the 61&ndash;90 Days tile and returned by the 61&ndash;90 Days filter. The bar also shows a grey slice for invoices with no due date.
        </p>
        <p className="text-gray-600 mt-3">
          <strong>Money is never added across currencies.</strong> A tile shows each currency separately, for example &ldquo;&yen;879,917 + &euro;1,200&rdquo;. A client billed in two currencies appears as two rows. The aging bar can only show one currency, so it shows the one with the largest balance and says so; the tiles include them all.
        </p>
      </section>

      {/* Views */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Two Views</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li><strong>By Client</strong> &mdash; Each client with its total outstanding and small chips for the amount in each age bucket. Expand a client to see its open invoices and a link to the client profile.</li>
          <li><strong>By Invoice</strong> &mdash; A table of every open invoice with due date, days overdue, total, paid, balance and age badge.</li>
        </ol>
        <p className="text-gray-600 mt-3">Lists show 15 rows per page.</p>
      </section>

      {/* Filtering */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Searching &amp; Filtering</h2>
        <p className="text-gray-600 mb-3">
          Search by client name, client email or invoice number. The <strong>Aging</strong> dropdown filters to:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Current (Not Due)</strong></li>
          <li><strong>1&ndash;30 Days Overdue</strong></li>
          <li><strong>31&ndash;60 Days Overdue</strong></li>
          <li><strong>61&ndash;90 Days Overdue</strong></li>
          <li><strong>90+ Days Overdue</strong></li>
          <li><strong>No due date</strong></li>
        </ul>
        <p className="text-gray-600 mt-3">The tiles and the bar follow the filter.</p>
      </section>

      {/* Actions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Chasing Payment</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click the <strong>Send Reminder</strong> (mail) icon to open your mail app with a message to the client already written: invoice number, original amount, amount paid, balance due, due date and days overdue. Nothing is sent by the system; you send it from your mail app. If the client has no email address, you are told so.</li>
          <li>Click <strong>View Invoice</strong> to open the full invoice.</li>
          <li><strong>CSV</strong> and <strong>PDF</strong> in the header export the client list as it is filtered: client, total invoiced, total paid, outstanding, invoice count and oldest invoice. &ldquo;Total paid&rdquo; is what has been paid on the invoices still open, not all payments ever received.</li>
        </ol>
        <Tip>
          For scheduled, multi-stage chasing rather than one-off reminders, see <Link href="/docs/invoice-reminders" className="underline">Invoice Reminders</Link>, which automates the whole reminder cadence.
        </Tip>
      </section>

      {/* Limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It does not record payments. Record them under Payments; the balance here updates from the invoice.</li>
          <li>It does not convert currencies or give one grand total across currencies.</li>
          <li>It does not send reminders itself, and it does not list drafts.</li>
          <li>It is not a client statement; it shows open invoices only, not paid ones.</li>
        </ul>
      </section>
    </div>
  )
}
