import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip, DocScreenshot } from '../layout'

export default function ClientsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Clients</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Clients</h1>
      <p className="text-gray-600 mb-8">
        <strong>People &rsaquo; Clients</strong> holds the people you sell trips to: their contact details, how they
        reached you, what they have been invoiced and have paid, the notes and calls you logged, and their follow-ups.
        Admins, managers and agents see it (the owner always does); viewers do not. Everything on these screens belongs
        to the company you are working in &mdash; if you belong to two companies, switching company switches the clients.
      </p>

      {/* The list */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The client list</h2>
        <DocScreenshot src="/docs/clients/client-list.jpg" alt="Client list page with search, filters, and client rows" />

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">The cards at the top</h3>
        <p className="text-gray-600 mb-3">
          The cards count the whole company and do not change with the search or the filters.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Clients</strong> &mdash; every client in the company.</li>
          <li><strong>Leads, Prospects, Customers, Inactive</strong> &mdash; how many clients have each <Link href="#statuses" className="text-primary-600 hover:underline">status</Link>. Together they add up to the first card.</li>
          <li><strong>VIP Clients</strong> &mdash; clients marked VIP.</li>
          <li><strong>New (This Month)</strong> &mdash; clients created since the 1st of the current month.</li>
          <li><strong>Total invoiced</strong> &mdash; the sum of what every client has been invoiced, one amount for each currency (for example &ldquo;¥1,200,000 + $3,400.00&rdquo;). Draft and cancelled invoices are not counted.</li>
          <li><strong>Total collected</strong> &mdash; the sum of what has been paid against those invoices, again for each currency.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Amounts in different currencies are never added together or converted; each currency keeps its own figure.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">The rows</h3>
        <p className="text-gray-600 mb-3">
          Each row shows the client&apos;s name and client code, email and phone, type and status, lead source, number of
          bookings, and <strong>Revenue</strong>. Revenue is what the client has been invoiced, in each currency they
          were invoiced in; a second line, <strong>Collected</strong>, shows what they have paid. <strong>View</strong>{' '}
          opens the client page, <strong>Edit</strong> the edit form. <strong>Delete</strong> appears for admins and
          managers only (see <Link href="#deleting" className="text-primary-600 hover:underline">Deleting a client</Link>).
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Finding a client</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The <strong>search</strong> box matches first name, last name, a full name (&ldquo;Ana Silva&rdquo;), email, phone and client code.</li>
          <li><strong>Filters</strong> narrow by status (Lead, Prospect, Customer, Inactive), client type, lead source, VIP only, and the date the client was created (from and to).</li>
          <li><strong>Sort by</strong> most recent, oldest, name A&ndash;Z or Z&ndash;A, revenue, or most bookings. Sorting by revenue uses each client&apos;s largest amount in any single currency, so it is a rough order for clients invoiced in several.</li>
          <li>The list shows 50 clients a page. Under it, <strong>Previous</strong> and <strong>Next</strong> move between pages and the line between them gives the position and the exact total, for example &ldquo;51&ndash;100 of 312 clients&rdquo;. The total counts the clients that match your search and filters.</li>
        </ul>
      </section>

      {/* Adding */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding a client</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Add Client</strong> (top right of the list).</li>
          <li>Go through the five steps: <strong>Basic Info</strong>, <strong>Contact</strong>, <strong>Preferences</strong>, <strong>Business</strong> and <strong>Classification</strong>. You can jump between steps.</li>
          <li>Click <strong>Create Client</strong> on the last step.</li>
        </ol>
        <p className="text-gray-600 mt-3 mb-2"><strong>Required:</strong> first name, last name, email address and lead source. Everything else is optional: nationality, passport type, date of birth, address, dietary and accessibility needs, VIP, marketing, newsletter and SMS consent, tags, currency preference. A box you leave empty is saved as empty.</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>A new client starts with the status <strong>Lead</strong>.</li>
          <li>It gets the next client code for your company, <strong>CLI-0001</strong>, <strong>CLI-0002</strong> and so on. Each company numbers its own clients, so two companies can both have a CLI-0001. A code never changes.</li>
          <li>If the same email address (capitals do not matter) already belongs to a client in your company, nothing is created. The form tells you who has it and offers <strong>Open</strong> that client, or <strong>Create anyway</strong> if you really want a second record.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Clients are also created for you: from a WhatsApp or email lead, from a website order, when a B2B quote is
          converted to a trip, and from a Concierge brief. Each of these first looks for an existing client of your company
          with the same email address (in any capitalisation) and uses that one.
        </p>
      </section>

      {/* Statuses */}
      <section className="mb-10" id="statuses">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Statuses</h2>
        <p className="text-gray-600 mb-3">A client is always in one of four statuses:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Lead</strong> &mdash; has asked for something; nothing is quoted yet. Where new clients start.</li>
          <li><strong>Prospect</strong> &mdash; has a trip being quoted.</li>
          <li><strong>Customer</strong> &mdash; has a confirmed or completed trip.</li>
          <li><strong>Inactive</strong> &mdash; kept on record, no longer in your active work. Set by hand.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The system moves a client forward on its own: a pending or quoted trip makes a Lead a Prospect, and a confirmed or
          completed trip makes a Lead or Prospect a Customer. It never moves a client back, and never touches Inactive.
          You can set any of the four by hand on the edit form. VIP is a separate tick-box, not a status.
        </p>
      </section>

      {/* Client page */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The client page</h2>
        <p className="text-gray-600 mb-3">
          Click a client&apos;s name. The header shows the name, a star for VIP, the status, type, client code, email, phone,
          nationality and company, and three figures:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Bookings</strong> &mdash; the client&apos;s confirmed or completed trips that are linked to the client.</li>
          <li><strong>Invoiced</strong> &mdash; the total of the client&apos;s invoices that are not draft or cancelled, one amount per currency.</li>
          <li><strong>Collected</strong> &mdash; what has been paid against those invoices, one amount per currency. The difference is what the client still owes.</li>
        </ul>
        <p className="text-gray-600 mt-3 mb-3">A dash means nothing has been invoiced (or paid) yet. The tabs:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Overview</strong> &mdash; language, passport type, preferred contact, member since, special interests, internal notes, tags, quick actions and the last contact.</li>
          <li><strong>Communications</strong> &mdash; the calls, messages, emails and meetings logged for this client, newest first, 20 at a time. The tab shows the total number; <strong>Show older communications</strong> loads the next 20.</li>
          <li><strong>Bookings</strong> &mdash; the client&apos;s trips: those linked to the client and those that carry the client&apos;s email address, in your company. Each shows its name, dates, number of people and total.</li>
          <li><strong>Notes</strong> &mdash; internal notes, visible only to your team, each with the name of the person who wrote it.</li>
          <li><strong>Follow-ups</strong> &mdash; reminders linked to this client; mark them complete here.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Under the tabs, the <strong>Timeline</strong> lists the client&apos;s creation, communications, trips, notes and
          follow-ups together, newest first, and can be filtered by kind. Its trips are the same ones the Bookings tab shows.
        </p>

        <h3 className="text-lg font-medium text-gray-900 mt-6 mb-3">Quick actions</h3>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>New Trip</strong> &mdash; starts a trip for this client.</li>
          <li><strong>Log Communication</strong> &mdash; records a WhatsApp, email, phone call, meeting, video call, SMS or other contact: direction (inbound or outbound), optional subject, details, date and time, and whether it is completed, pending or scheduled. A completed communication moves the client&apos;s <strong>Last contact</strong> date to it if it is later than the one on file; a pending or scheduled one does not.</li>
          <li><strong>Add Follow-up</strong> &mdash; creates a reminder to call or email the client.</li>
          <li><strong>Add Note</strong> &mdash; a note of one of these types: general, preference, complaint, compliment, dietary, accessibility, travel history, payment, special request or internal, with an <strong>Important</strong> tick-box. Notes and communications can be edited and deleted from their tab by any agent, manager or admin.</li>
        </ul>
        <Tip>
          <strong>Tip:</strong> Keep detailed notes on preferences (dietary requirements, hotel preferences, who travels
          with them) so the next trip starts from what you already know.
        </Tip>
      </section>

      {/* Editing */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Editing a client</h2>
        <p className="text-gray-600 mb-3">
          <strong>Edit Client</strong> changes the first and last name, email, phone, nationality, company, client type,
          status, lead source, VIP, passport type, preferred language, preferred contact method, internal notes, special
          interests and tags. First and last name are required. The email is not &mdash; a client who came from a WhatsApp
          chat or a web order may have none &mdash; but if you enter one it must be a valid address.
        </p>
        <p className="text-gray-600">
          The client code, the invoiced and collected amounts and the booking count cannot be edited: the code is fixed
          at creation, and the money and counts follow the client&apos;s invoices and trips. The passport type is a note on
          the client; entrance-fee pricing reads the passport choice on each trip, not this field.
        </p>
      </section>

      {/* Deleting */}
      <section className="mb-10" id="deleting">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Deleting a client</h2>
        <p className="text-gray-600 mb-3">
          Only admins and managers (and the owner) can delete a client; agents do not see the button.
        </p>
        <p className="text-gray-600 mb-3">
          A client can be deleted only if nothing is attached to it: no trips (linked to the client or carrying the same
          email), no bookings, no invoices, no payments, no WhatsApp or email conversations and no documents. If anything
          is, nothing is deleted. The dialog lists what is attached, with counts &mdash; for example &ldquo;2 trips, 1
          booking and 3 invoices&rdquo; &mdash; and offers <strong>Mark inactive</strong> instead, which keeps the client and
          everything attached to it but takes the client out of your active work.
        </p>
        <p className="text-gray-600">
          Deleting a client that is free of all that also deletes its notes, logged communications, follow-ups,
          preferences and contacts. It cannot be undone. There is no force option.
        </p>
      </section>

      {/* Contacts */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Contacts directory</h2>
        <p className="text-gray-600 mb-3">
          <strong>Contacts</strong> (the address <code className="bg-gray-100 px-1 rounded">/contacts</code>) is a second way
          to look at the same clients, as cards, a table or a list. It has no entry in the side menu; agents, managers and
          admins can open it by its address. It lists your company&apos;s clients only.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Search by name, email or phone; sort the table by name, email, nationality or status; 12, 24 or 48 contacts a page.</li>
          <li><strong>Add Contact</strong> and <strong>Edit</strong> take first name and last name (both required), email, phone, nationality, status (Lead, Prospect, Customer or Inactive), preferred language and notes. The notes are saved as the client&apos;s internal notes. A new contact is subject to the same duplicate-email check as on the New client form.</li>
          <li><strong>Delete</strong> follows the rules above; if the client has anything attached the dialog lists it and offers <strong>Mark inactive</strong>.</li>
          <li><strong>Export</strong> downloads the contacts currently shown (after your search) as a CSV file. Values that begin with =, +, - or @ are prefixed with a quote so a spreadsheet shows them as text instead of running them.</li>
        </ul>
      </section>

      {/* Limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It does not merge clients. If a duplicate slips in (a different email for the same person, or &ldquo;Create anyway&rdquo;), both records stay.</li>
          <li>The duplicate check is on email only, and only when a client is created; it does not look at phone or name, and changing a client&apos;s email later is not checked.</li>
          <li>It does not show an average booking value: with trips and invoices in different currencies, an average is not a number that means anything.</li>
          <li>Money is never converted between currencies, so there is no single &ldquo;total revenue&rdquo; across currencies.</li>
          <li>The Bookings count and tile include only trips linked to the client; a trip that merely carries the client&apos;s email shows on the Bookings tab and timeline but is not counted.</li>
          <li>Communications are saved with the name of the person who logged them, but the client page does not display it; notes do show their author.</li>
          <li>Any agent, manager or admin can edit or delete any note or logged communication, not only their own.</li>
          <li>It does not import clients from a file.</li>
        </ul>
      </section>
    </div>
  )
}
