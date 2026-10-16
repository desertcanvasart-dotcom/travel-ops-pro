import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function MessageTemplatesPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Message Templates</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Message Templates</h1>
      <p className="text-gray-600 mb-8">
        Reusable email and WhatsApp messages with <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">{'{{Placeholders}}'}</code>.
        You pick a recipient, optionally link an itinerary to fill in the trip details, check the preview, and send.
      </p>

      {/* Where and who */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where to find it and who can use it</h2>
        <p className="text-gray-600 mb-3">
          Open <strong>Communicate › Message Templates</strong>. The owner, admins, managers and agents see it in the
          menu and can open it. Viewers cannot open the page or read templates through the API.
        </p>
        <p className="text-gray-600 mb-3">
          Templates belong to a company. You see your company&apos;s own templates plus the shared starter templates
          that every company gets. If you work in more than one company, you see the templates of the company you are
          working in.
        </p>
      </section>

      {/* The list */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The template list</h2>
        <p className="text-gray-600 mb-3">The heading shows how many templates match your filters out of the total. Three rows of filters narrow the list:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Search templates</strong> &mdash; matches the name, the description and the body text</li>
          <li><strong>Category</strong> &mdash; All Templates, Customer, Partner, B2B, Supplier, Internal</li>
          <li><strong>Channel</strong> &mdash; All Channels, Email, WhatsApp, Both. Email and WhatsApp also show templates set to Both.</li>
          <li><strong>Language</strong> &mdash; All, EN, JA. It starts on the language your screen is in.</li>
        </ul>
        <p className="text-gray-600 mb-3">
          Each card shows the name, a channel icon, the first line of the body, the category, the language (EN or JA)
          and the subcategory. The buttons on a card are copy to clipboard, <strong>Preview</strong>, <strong>Send</strong>,
          and a menu with <strong>Edit</strong> and <strong>Delete</strong>.
        </p>
        <p className="text-gray-600">
          <strong>Preview</strong> shows the subject, the body and the placeholders the template uses, with a
          <strong> Send This Template</strong> button.
        </p>
      </section>

      {/* Creating */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating a template</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>New Template</strong>.</li>
          <li>Enter a <strong>Name</strong> (required).</li>
          <li>Choose the <strong>Category</strong>:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li><strong>Customer</strong> &mdash; sent to one of your clients</li>
              <li><strong>Partner</strong> and <strong>B2B</strong> &mdash; sent to a B2B partner (a travel agency from your partner list)</li>
              <li><strong>Supplier</strong> &mdash; sent to a hotel, Nile cruise, transport supplier, guide or other supplier, depending on the subcategory</li>
              <li><strong>Internal</strong> &mdash; sent to a client record, like Customer (there is no staff recipient list)</li>
            </ul>
          </li>
          <li>Choose the <strong>Channel</strong>: Email, WhatsApp or Both. With Both you pick the channel when you send.</li>
          <li>Choose the <strong>Language</strong>: EN or JA. This is a label for filtering; the app does not translate templates.</li>
          <li>Optionally fill in the <strong>Subcategory</strong> (for example quotation or voucher) and a <strong>Description</strong>.</li>
          <li>For Email and Both, write the <strong>Subject (Email)</strong>.</li>
          <li>Write the <strong>Body</strong> (required), using placeholders for anything that changes per message.</li>
          <li>Click <strong>Create Template</strong>.</li>
        </ol>
        <p className="text-gray-600 mt-3">
          A company cannot have two templates with the same name, channel and language. If you try, the app tells you
          and keeps the form open so you can rename it.
        </p>
      </section>

      {/* Editing / deleting */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Editing and deleting</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Edit</strong> a template of your own and it changes in place.</li>
          <li><strong>Edit</strong> a shared starter template and your company gets its own copy with your changes. From then on the copy replaces the starter in your list. Other companies keep the original.</li>
          <li><strong>Delete</strong> asks for confirmation and removes one of your company&apos;s own templates. A shared starter template cannot be deleted; the app shows the reason.</li>
        </ul>
        <p className="text-gray-600 mt-3">If a save or delete fails, a message tells you why.</p>
      </section>

      {/* Placeholders */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Placeholders</h2>
        <p className="text-gray-600 mb-3">
          Write a placeholder as <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">{'{{Name}}'}</code>. You do
          not register them: the app finds every placeholder in the body and the subject when you save. When you send,
          each one gets its own input field, labelled from the placeholder list where the app knows it.
        </p>
        <p className="text-gray-600 mb-3">Values come from three places, and you can change any of them before sending:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>The recipient you pick</strong>:
            <ul className="list-disc list-inside ml-6 mt-1 space-y-1 text-gray-600">
              <li>Client: GuestName, ClientName, ClientEmail, ClientPhone</li>
              <li>B2B partner: PartnerName, PartnerCompany, PartnerEmail, PartnerPhone, ContactName and PartnerContactName (the partner&apos;s contact person, or the company name if none is set)</li>
              <li>Supplier: SupplierName, HotelName, CruiseName, GuideName, ProviderName, ContactName, SupplierEmail, SupplierPhone, SupplierWhatsApp</li>
            </ul>
          </li>
          <li><strong>The itinerary you link</strong> (optional): the client, trip name and code, dates, number of travellers,
            pickup details, totals, deposit and balance, plus your company name, email and phone and your own name as
            AgentName. Money is shown in the trip&apos;s currency, or your company&apos;s default currency if the trip has none.</li>
          <li><strong>What you type</strong> in the fields.</li>
        </ul>
        <Tip>
          In a <strong>B2B</strong> template, <code className="bg-gray-100 px-1 rounded">{'{{AgentName}}'}</code> means the
          partner&apos;s travel agent you are writing to, so it is filled with the partner&apos;s contact person, not your name.
          In every other category AgentName is you, the sender. For new B2B templates, prefer
          <code className="bg-gray-100 px-1 rounded"> {'{{PartnerContactName}}'}</code>.
        </Tip>
      </section>

      {/* Sending */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Sending a template</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Send</strong> on a card (or <strong>Send This Template</strong> in Preview).</li>
          <li>If the template is set to Both, choose <strong>WhatsApp</strong> or <strong>Email</strong>. WhatsApp is selected first.</li>
          <li>Pick the recipient. The list depends on the category: your clients, your B2B partners, or the suppliers of the type the subcategory names.</li>
          <li>Optionally choose an itinerary under <strong>Pre-fill from Itinerary</strong> (the 50 most recently created trips).</li>
          <li>Check and edit the values under <strong>Fill Placeholders</strong>. The preview on the right updates as you type.</li>
          <li>Click <strong>Send WhatsApp</strong> or <strong>Send Email</strong>. If any placeholder is still unfilled, the app lists them and asks before sending.</li>
        </ol>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mt-4">
          <li><strong>Email</strong> goes out from your own connected Gmail account, and only if it is connected in the company you are working in.</li>
          <li><strong>WhatsApp</strong> goes out from your company&apos;s WhatsApp number. The message is added to that number&apos;s conversation in your WhatsApp inbox, so whoever replies next can see it.</li>
          <li>Every send, successful or failed, is recorded in your company&apos;s send log.</li>
        </ul>
      </section>

      {/* Limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>It does not show how often a template has been used. Sends are logged, but no screen shows the counts.</li>
          <li>It does not translate a template. Keep an EN and a JA version side by side and pick with the Language filter.</li>
          <li>It does not schedule sends; Send goes out immediately.</li>
          <li>It sends to one recipient at a time.</li>
          <li>WhatsApp is subject to WhatsApp&apos;s 24-hour rule: if the customer has not written to you in the last 24 hours, the message may not be delivered.</li>
          <li>Copying a template to the clipboard copies the raw text with its placeholders unfilled.</li>
        </ul>
      </section>
    </div>
  )
}
