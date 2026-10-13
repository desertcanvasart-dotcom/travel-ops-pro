import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'

export default function BookingsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Bookings</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Bookings</h1>
      <p className="text-gray-600 mb-8">
        A booking is a sold trip being run: its suppliers, the money the client owes and has paid, the travellers and the
        operational notes. Open it from <strong>Sell &rsaquo; Bookings</strong>. The menu shows it to admins, managers and
        agents; the owner always sees it. You only ever see your own company&apos;s bookings.
      </p>

      {/* How a booking is born */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How a booking is made</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Create booking</strong> on the itinerary page.</li>
          <li>Setting the itinerary to <strong>Confirmed</strong> (it is created at the same moment).</li>
          <li>
            <strong>Ready to book</strong> on an accepted quote &mdash; the booking takes the quote&apos;s selling price and
            currency.
          </li>
        </ul>
        <p className="text-gray-600 mb-3">
          A trip is booked only when it has a usable price (more than zero, with a currency) and is not a draft or cancelled;
          otherwise you are told why and nothing is created. A trip has at most one booking.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>
            The code is <strong>BKG-YYYY-NNNN</strong>, numbered per company: each company counts its own bookings, and two
            bookings made at the same moment never get the same code.
          </li>
          <li>
            The deposit is your company&apos;s deposit percentage of the total (20% when none is set), due a set number of
            days after booking; the balance is due a set number of days before departure (your company&apos;s payment terms).
          </li>
          <li>
            <strong>Balance due</strong> starts at the full total and goes down only when a payment is recorded.
          </li>
        </ul>
      </section>

      {/* List */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The list</h2>
        <p className="text-gray-600 mb-3">
          Titled <strong>Bookings</strong> (&ldquo;Manage confirmed trips and operational tracking&rdquo;). The newest bookings
          come first, 50 at a time, with <strong>Load more</strong> for the next 50.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li>
            Cards: <strong>Total, Pending, Suppliers Confirmed, Ready, In Progress, Completed, Cancelled</strong> &mdash; counts
            of all your company&apos;s bookings by status. Click one to show only those. Payment Received has no card; choose it
            in the status filter.
          </li>
          <li>
            <strong>Search</strong> matches the booking code, client name or trip name across every booking, on the server.
          </li>
          <li>
            Columns: Booking Code, Client, Trip Name, Dates (with a badge when the trip starts within 7 days), Passengers,
            Status, and View.
          </li>
        </ul>
        <DocScreenshot src="/docs/bookings/bookings-list.jpg" alt="Bookings list page with status cards and booking rows" />
      </section>

      {/* Detail */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The booking page</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Overview</strong> &mdash; Total Cost, Deposit Amount and Balance Due, in the booking&apos;s currency.</li>
          <li>
            <strong>Status buttons</strong>. <strong>Suppliers Confirmed</strong> asks you to confirm when not every supplier
            row is confirmed, and records who went ahead.
          </li>
          <li>
            <strong>Suppliers</strong> &mdash; one row per supplier and day from the trip&apos;s services;{' '}
            <strong>Sync from Itinerary</strong> adds new ones. Confirming a row with a cost records an expense in the
            booking&apos;s currency.
          </li>
          <li><strong>Payments</strong> &mdash; the trip&apos;s invoices and the payments against them.</li>
          <li><strong>Passengers</strong> and <strong>Notes</strong> (special requests and operational notes).</li>
          <li>
            Panels: portal coordinator, insurance, extras (confirmed extras are added to the total), traveller documents
            (managers and above), portal messages, and party-size change requests.
          </li>
          <li>
            <strong>Send confirmation</strong> is shown to owners, admins and managers only &mdash; it messages the customer.
          </li>
        </ul>
        <Tip>
          A party-size change request is resolved once: <strong>Approve</strong> adds the new travellers (blank, for the portal
          to fill) and re-prices per person; a second click, or a colleague approving at the same moment, is told the request
          is already resolved.
        </Tip>
      </section>

      {/* Money */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Money on a booking</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            The payment status, deposit, deposit paid and balance are changed only by recording a payment (or by the
            re-pricing of extras and party-size changes). Editing a booking cannot mark it paid.
          </li>
          <li>
            A booking with a recorded payment (or a deposit marked paid) cannot be deleted. Cancel it instead &mdash; the
            payments stay on record for refunds and the accounts.
          </li>
          <li>
            The trip of a booking cannot be deleted either; cancel the trip (Cancel trip on the itinerary page), which can
            cancel the booking with it.
          </li>
          <li>
            <strong>VAT</strong>: the booking&apos;s total, deposit and balance are the net figures from the quote. The
            payment summary shows the trip&apos;s VAT line (<strong>VAT 14% included: &lt;amount&gt;</strong> or{' '}
            <strong>VAT not applied</strong>), and VAT is billed on the trip&apos;s invoices. Booking a quote passes its VAT
            choice and rate to the trip.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Moving a booked trip to new dates is not done for you: the calendar refuses to drag it.</li>
          <li>Bookings are not linked to a client record; they carry the client&apos;s name and contact details.</li>
          <li>There is no booking delete button; cancelling is the normal way out.</li>
        </ul>
      </section>
    </div>
  )
}
