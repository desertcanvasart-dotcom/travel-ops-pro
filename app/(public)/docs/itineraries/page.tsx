import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'

export default function ItinerariesPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Itineraries</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Itineraries</h1>
      <p className="text-gray-600 mb-8">
        An itinerary is a trip: the client, the dates, the travellers, a day-by-day plan with a service line for each thing
        you buy, and the price the client pays. It is what you quote, send, confirm and book. Open it from{' '}
        <strong>Sell &rsaquo; Itineraries</strong>. The menu shows it to admins, managers and agents; the owner always sees
        it. You only ever see your own company&apos;s trips.
      </p>

      {/* List */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The list</h2>
        <p className="text-gray-600 mb-3">
          The page is titled <strong>Itineraries</strong> (&ldquo;Create and manage client trip itineraries&rdquo;), newest
          first, 100 rows at a time with <strong>Load more</strong> for the next 100. Partner (B2B) trips are not listed here.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li>
            <strong>Total, Draft, Sent, Confirmed, Completed, Cancelled</strong> &mdash; how many of your company&apos;s
            trips are in each status, counted on the server over every trip (not just the rows loaded). Click a card to
            show only that status.
          </li>
          <li>
            <strong>Search</strong> &mdash; client name or email, trip name or itinerary code. It searches every trip on the
            server, a moment after you stop typing.
          </li>
          <li>
            Columns: <strong>Code, Created, Client, Trip, Owner</strong> (&ldquo;Unassigned&rdquo; in amber when nobody owns it),{' '}
            <strong>Dates, Days, Pax</strong> (adults / children), <strong>Cost</strong> (the client price in the trip&apos;s
            currency), <strong>Lang</strong>, <strong>Status</strong> and <strong>Actions</strong> (View, Edit, Delete).
          </li>
        </ul>
        <DocScreenshot src="/docs/itineraries/itinerary-list.jpg" alt="Itineraries list page with status cards and search bar" />
      </section>

      {/* Status */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Changing the status</h2>
        <p className="text-gray-600 mb-3">The Status dropdown on each row offers Draft, Sent, Confirmed, Completed and Cancelled.</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>Confirmed</strong> books the trip: its booking is created at the same moment, with your company&apos;s
            payment terms. A trip with no usable price (a total of zero, or no currency) cannot be confirmed &mdash; you are
            told to price it first, and nothing changes. If the booking could not be created, you are told, and you can
            use <strong>Create booking</strong> on the trip.
          </li>
          <li>
            <strong>Cancelled</strong> opens the same <strong>Cancel trip</strong> dialog as the itinerary page: an optional
            reason, and, when the trip has a booking, a box (ticked) to cancel the booking with it.
          </li>
          <li>Only these statuses (and Quoted, which the quote flow sets) are accepted; anything else is refused.</li>
        </ul>
      </section>

      {/* Delete */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Deleting a trip</h2>
        <p className="text-gray-600 mb-3">
          The bin asks you to confirm first. A trip is deleted only when nothing has happened on it yet. The delete is
          refused, with the reasons, when the trip:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li>has a booking (whatever its status),</li>
          <li>has a customer payment recorded against it or its booking,</li>
          <li>has an invoice,</li>
          <li>has a supplier document that has been sent (anything but draft or cancelled), or</li>
          <li>is Confirmed or Completed.</li>
        </ul>
        <p className="text-gray-600">
          Cancel such a trip instead. When a trip is deleted, its days, services, translations, resource assignments, share
          links and draft supplier documents go with it, and the contract and supplier-document PDFs stored for it are removed
          from storage first.
        </p>
      </section>

      {/* View page */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The itinerary page</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The stage steps and the one next action (send the quote, convert, create the booking, create the invoice, record a payment, &hellip;).</li>
          <li>
            <strong>Profit &amp; Loss</strong> &mdash; managers and above see the actual figures; agents see the quoted
            figures only (the actual P&amp;L is a financial screen).
          </li>
          <li>Resources and their coverage (guide, vehicle, hotels, staff), the trip owner, and the share link.</li>
          <li>
            <strong>Create share link</strong> is refused while the trip is a draft or has no price, unless you choose to
            share it anyway.
          </li>
          <li>Send by email or WhatsApp &mdash; marks the trip Sent only when it was a draft or quoted.</li>
          <li>
            The <strong>More</strong> menu: Edit itinerary, Add expense, Operations tasks, Duplicate, Cancel trip (or Reopen
            when cancelled), and <strong>Generate commissions</strong> &mdash; shown only to admins and managers.
          </li>
          <li>
            <strong>Manual cost mode</strong> lets you change each line&apos;s cost; the client total is then the sum of the
            lines&apos; client prices plus any season supplement.
          </li>
        </ul>
      </section>

      {/* VAT */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">VAT</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>A trip carries VAT when the quote it was converted from, or the quote it was booked from, carried VAT. It takes that quote&apos;s rate.</li>
          <li>The price card shows <strong>VAT 14% included: &lt;amount&gt;</strong> or <strong>VAT not applied</strong>. The amount is the trip&apos;s current client total at the recorded rate, so it follows the total when the trip is edited.</li>
          <li>The itinerary PDF, the email and WhatsApp message, the share page, the contract and the traveller portal state the same line; the PDF, email and share page also give the total including VAT.</li>
          <li>The invoice created from the trip starts with VAT on when the trip carries it.</li>
        </ul>
      </section>

      {/* Edit page */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The editor</h2>
        <p className="text-gray-600 mb-3">
          <strong>Edit</strong> opens the day and service editor. Days have a city, title, description and overnight city;
          each service line has a type, a name, a supplier (or a rate from your rate tables), a quantity and a rate.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            Rates are in your company&apos;s <strong>rate currency</strong>; the line total is in the{' '}
            <strong>trip&apos;s currency</strong>. Changing a quantity or a rate converts it: at the rate the line already
            carries, else the trip&apos;s frozen rate (set when it was confirmed), else today&apos;s rate. The original
            amount and the rate used are shown under the line. If no exchange rate can be loaded, the change is not made and
            you are told why.
          </li>
          <li>
            The client price of a changed line moves with its cost, at the line&apos;s own mark-up (or the trip&apos;s margin,
            or 25% for a new line).
          </li>
          <li>
            <strong>Total Cost</strong> at the bottom is the sum of the line costs. When you save, the trip&apos;s client
            total becomes the sum of the lines&apos; client prices plus the season supplement &mdash; the same figure the
            itinerary page, documents and booking use &mdash; and its supplier cost and profit are stored with it.
          </li>
          <li>
            <strong>Reprice FX</strong> (on a confirmed trip with frozen rates) is shown only to admins and managers.
          </li>
        </ul>
        <Tip>
          The editor saves from your browser. Your company&apos;s days and services are the only ones it can read or write:
          the database refuses any other company&apos;s.
        </Tip>
      </section>

      {/* New */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">New Itinerary</h2>
        <p className="text-gray-600 mb-3">
          <strong>New Itinerary</strong> asks for the client&apos;s name, email and phone, the trip name, start and end dates,
          adults, children (ages 4&ndash;12), infants, the currency, an optional programme and notes. It creates a draft at
          zero with a code like ITN-2026-4821 and an English version. See{' '}
          <Link href="/docs/itinerary-creation" className="text-primary-600 hover:underline">Itinerary Creation</Link> for the details.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Partner (B2B) trips are not in this list; they are on the calendar and in the B2B screens.</li>
          <li>A trip that has been booked or paid cannot be deleted, only cancelled.</li>
          <li>The list does not move a trip&apos;s dates; the calendar does, for a trip without a booking or supplier documents.</li>
          <li>The editor&apos;s Invoice button bills the trip total as one line; VAT is added when the trip carries it.</li>
          <li>A trip made without a quote carries no VAT, and there is no switch for it on the trip itself; set VAT on the quote or on the invoice.</li>
        </ul>
      </section>
    </div>
  )
}
