import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function ResourcesDocumentsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Documents</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Documents</h1>
      <p className="text-gray-600 mb-8">
        <strong>Operate &rarr; Documents</strong> is where your company&apos;s supplier documents live: hotel, transport,
        cruise and activity vouchers, guide assignments and service orders. Customer contracts, invoices and receipts are
        opened from the trip, booking or payment they belong to. Guides, vehicles, hotels and restaurants are kept under{' '}
        <Link href="/docs/suppliers" className="text-primary-600 hover:underline">Suppliers</Link>; reusable texts under{' '}
        <Link href="/docs/content-library" className="text-primary-600 hover:underline">Content Library</Link>.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who Can Use It</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The menu shows <strong>Documents</strong> to the owner, <strong>Administrators</strong> and <strong>Managers</strong>.</li>
          <li>
            <strong>Agents</strong> do not have it in the menu. They open individual vouchers, contracts, invoices and
            receipts from trips, bookings and payments (the <strong>Generate Documents</strong> button, the trip&apos;s
            <strong> Contract</strong> item, a payment&apos;s invoice and receipt links).
          </li>
          <li><strong>Viewers</strong> cannot open these pages.</li>
          <li>Everything you see is your own company&apos;s. Two companies on the same system never see each other&apos;s documents.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Documents Page</h2>
        <p className="text-gray-700 mb-3">
          Titled <strong>Documents</strong> (&ldquo;Create and manage all your business documents&rdquo;), it has two sections:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>Customer Documents</strong> has one card, <strong>Customer Contracts</strong>. It takes you to your
            itineraries; there is no list of contracts. A contract is opened from its trip.
          </li>
          <li>
            <strong>Supplier Documents</strong> has a <strong>View All</strong> link and seven cards: All Supplier Documents,
            Hotel Vouchers, Transport Vouchers, Cruise Vouchers, Activity Vouchers, Guide Assignments and Service Orders.
            Each card opens the supplier documents list filtered to that type.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Generating Supplier Documents</h2>
        <p className="text-gray-700 mb-3">
          The <strong>Generate Documents</strong> button is on the itinerary page, the itinerary editor and the booking page.
          It makes one document per supplier on the trip: a hotel voucher per stay, a cruise voucher per sailing, a transport
          voucher per place, and a guide assignment per assigned guide. It only makes what is missing, so pressing it again
          does not duplicate anything.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            Generation is refused when the trip&apos;s price is not deliverable (for example, no total yet). Fix the price
            first.
          </li>
          <li>
            A document states its amounts in the trip&apos;s currency, or in the supplier&apos;s own currency when every line
            for that supplier was priced in it and still matches the trip.
          </li>
          <li>
            Numbers look like <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">HV-2026-0007</code>: HV hotel,
            TV transport, CV cruise, AV activity, GA guide assignment, SO service order, then the year and a running number.
            <strong> Each company has its own sequence</strong>, so your numbers run on without gaps from other companies&apos;
            documents. A number you type yourself only has to be unique within your company.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Supplier Documents List</h2>
        <p className="text-gray-700 mb-3">
          Titled <strong>Supplier Documents</strong>. Opened from a trip it shows only that trip&apos;s documents
          (&ldquo;Showing the documents of one trip&rdquo;, with a <strong>Show all documents</strong> link), plus two amber
          panels when they apply:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-4">
          <li><strong>N documents are not generated yet</strong>, with a <strong>Generate missing</strong> button: services on the trip that no document carries.</li>
          <li><strong>N documents no longer match the trip</strong>: documents holding lines the trip no longer has. Edit them, or cancel them and generate again.</li>
        </ul>
        <h3 className="text-lg font-medium text-gray-900 mb-3">The tiles</h3>
        <p className="text-gray-700 mb-3">
          <strong>Total Documents</strong>, <strong>Draft</strong>, <strong>Sent</strong>, <strong>Confirmed</strong>,{' '}
          <strong>Completed</strong> and <strong>Cancelled</strong>. Each is a count made by the database of all your
          company&apos;s supplier documents in that status (or, when the list is opened for a trip, all of that trip&apos;s).
          The type, status and search filters do not change them.
        </p>
        <h3 className="text-lg font-medium text-gray-900 mb-3">Filters and actions</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Type chips, an <strong>All Status</strong> select, and a search box (document number, supplier, client or city). The search looks through the rows already loaded.</li>
          <li><strong>View</strong> and <strong>Edit</strong> (Edit is hidden for a cancelled document).</li>
          <li><strong>Mark as Sent</strong> (from Draft), <strong>Mark as Confirmed</strong> (from Sent), <strong>Mark as Completed</strong> (from Confirmed), and <strong>Revert to Draft</strong>.</li>
          <li>
            <strong>Delete</strong> works only for a cancelled document, or a draft that was never sent. A document that has
            gone to the supplier (sent, confirmed, completed, or sent once and reverted to draft) is what the supplier holds,
            so deleting it is refused with an explanation: set its status to <strong>Cancelled</strong> on the Edit page
            first, then delete it.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewing, Editing and Sending a Document</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>Preview PDF</strong>, <strong>Download</strong> and <strong>Print</strong>. The voucher PDF is made in your
            browser with your Company Profile letterhead and logo, in the language you are using (English or Japanese).
          </li>
          <li>
            <strong>Send by Email</strong> goes from your company&apos;s connected Gmail to the supplier email saved on the
            document. Without a connected mailbox it says &ldquo;Gmail not connected&rdquo;.
          </li>
          <li><strong>Send by WhatsApp</strong> goes to the supplier&apos;s WhatsApp number on the document, else its phone, with the PDF as a private link that expires after 24 hours.</li>
          <li>
            The server only sends a real PDF of at most 10 MB. A successful send marks the document <strong>Sent</strong>
            (unless it is already Confirmed or Completed) and records when and how.
          </li>
          <li>
            The Edit page changes the supplier and contact details, guests, city and dates, pickup and drop-off, vehicle and
            driver, requests and internal notes, currency, total, payment terms and status.
          </li>
          <li>
            Per type, pickers rebuild the lines from your rate tables: transport routes, restaurant meals (service order),
            guides, and entrance fees (activity voucher). Rates are kept in your company&apos;s rate currency; a rate you pick
            is converted into the document&apos;s currency at the trip&apos;s frozen exchange rate, or today&apos;s rate when the
            trip has none. If no rate is known yet, the pick is refused with a message instead of adding the wrong amount.
            Every line and total is shown in the document&apos;s currency; the picker shows the rate itself in your rate
            currency.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Contracts, Invoices and Receipts</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>Contract</strong>: open it from the itinerary or booking&apos;s <strong>Contract</strong> item. You can edit
            it on the page (terms come from Settings &rarr; payment terms, and it can be translated), then download it as a
            PDF or send it by WhatsApp.
          </li>
          <li>
            <strong>Invoice</strong>: opened from a payment. Its number is{' '}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">INV-&lt;trip code&gt;-&lt;4 characters of the payment&gt;</code>.
          </li>
          <li><strong>Receipt</strong>: opened from a payment or from Receipts. It can be sent by WhatsApp only once the payment is completed.</li>
          <li>
            The invoice and receipt show the trip&apos;s client, contact details and total only when the trip belongs to your
            company. An old payment linked to a trip that is not yours shows none of them.
          </li>
          <li>
            The 日程表 (Japanese day schedule) and the operations sheet are made on the server, and only for a company that
            has those templates.
          </li>
        </ul>
        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">VAT</h3>
        <p className="text-gray-600 mb-3">
          Every document that shows a client price states whether VAT is on it: <strong>VAT 14% included:
          &lt;amount&gt;</strong> or <strong>VAT not applied</strong>. The itinerary PDF and the contract use the
          trip&apos;s VAT (carried from its quote); the invoice uses the VAT the invoice recorded; a receipt states the
          VAT inside the amount received. See{' '}
          <Link href="/docs/invoices-payments" className="text-primary-600 hover:underline">Invoices</Link> and{' '}
          <Link href="/docs/team-settings" className="text-primary-600 hover:underline">Settings</Link> for how the
          rate is set and recorded.
        </p>
        <Tip>
          Supplier documents are saved, so you can come back to them, edit them and resend them. Contracts, invoices and
          receipts are not stored: each is made fresh from the trip or payment when you open it.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>There is no list of contracts, invoices or receipts here; the Documents page lists supplier documents only.</li>
          <li>A document is a snapshot of the trip when it was generated. Later trip changes are flagged, not applied.</li>
          <li>Changing a document&apos;s <strong>Currency</strong> on the Edit page relabels it; it does not convert the lines already on it.</li>
          <li>The list has no paging. It loads every matching document at once; the search only looks through what was loaded.</li>
          <li>Status labels in the list are in English only.</li>
          <li>A document that has gone to the supplier cannot be deleted until it is cancelled.</li>
        </ul>
      </section>
    </div>
  )
}
