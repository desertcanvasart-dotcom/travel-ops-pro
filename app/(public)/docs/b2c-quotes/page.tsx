import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function B2CQuotesPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">B2C Quotes</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">B2C Quotes</h1>
      <p className="text-gray-600 mb-4">
        A B2C quote is a priced offer to a direct customer, made from one of your itineraries. It lives under{' '}
        <strong>Sell &rsaquo; B2C Quotes</strong>.
      </p>
      <p className="text-gray-600 mb-8">
        Admins and managers see it in the menu (the owner always does). Setting or changing a margin, sending an offer
        and deleting one are for managers and above.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Making an offer</h2>
        <p className="text-gray-600 mb-3">
          Press <strong>New offer</strong> and choose the itinerary. The list holds your newest 1,000 itineraries; type
          in the search box to find one by trip, code or client. Then set:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Margin %</strong>: between 0 and 100. Leave it empty for your company&apos;s default margin (Settings), or 25% if none is set.</li>
          <li><strong>Valid (days)</strong>: how long the offer stands, 30 by default.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The offer is for the itinerary&apos;s own party (its adults and children) and in the itinerary&apos;s
          currency. The form shows both. To offer a different number of travellers or another currency, change and
          re-price the itinerary first, then make the offer from it.
        </p>
        <p className="text-gray-600 mt-3 mb-2">The server works out the price, each step rounded to the currency (whole yen for JPY):</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Total cost</strong>: the itinerary&apos;s supplier cost (its total, for an old itinerary that has none).</li>
          <li><strong>Margin</strong>: total cost &times; margin %.</li>
          <li><strong>Season premium</strong>: (cost + margin) &times; the season&apos;s percentage, when the trip&apos;s first day falls in one of your seasons.</li>
          <li><strong>Selling price</strong>: cost + margin + premium.</li>
          <li><strong>Per person</strong>: selling price &divide; the party.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The offer gets its number from your company&apos;s own sequence, B2C-2026-00001 and on (offers made before
          October 2026 keep their older B2C-&hellip; numbers). It starts as a <strong>Draft</strong>.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The list</h2>
        <p className="text-gray-600 mb-3">
          Filter by status: All, Draft, Sent, Accepted, Rejected, Expired. A draft or sent offer whose valid-until date
          has passed shows as <strong>Expired</strong>. Each row shows the offer number and date, the itinerary and its
          client, the travellers, the price and price per person in the offer&apos;s currency, the valid-until date and
          the status, with View and Delete.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">An offer</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Offer pricing</strong>: total cost, margin (% and amount), the season premium when there is one, selling price, and per person &times; travellers.</li>
          <li>
            <strong>Re-price</strong>: set the margin and press the button. The offer is priced again from the itinerary
            as it stands now (its supplier cost, party and currency), keeping the offer&apos;s season premium.
          </li>
          <li><strong>Client notes</strong>: saved when you leave the box; the customer sees them in the message.</li>
          <li>
            <strong>Send by email</strong> (to the itinerary&apos;s client email) or <strong>Send by WhatsApp</strong>{' '}
            (to a number you confirm, starting from the trip&apos;s). A draft becomes Sent; another status stays as it
            is. A rejected or expired offer is not sent: set it back to draft, or move its date on, first.
          </li>
          <li><strong>Accept</strong> and <strong>Reject</strong>. An offer past its valid-until date cannot be accepted until you move the date on.</li>
          <li><strong>Valid until</strong>, which you can change.</li>
          <li><strong>Convert to booking</strong>, once accepted. The booking total is the offer&apos;s selling price.</li>
          <li>
            <Link href="/docs/quote-revisions" className="text-primary-600 hover:underline">Revision history</Link>, with
            compare and revert (managers and above).
          </li>
        </ul>
        <Tip>
          Once a booking is made from an offer, its price, status and validity no longer change and it cannot be deleted
          or reverted. Its notes can still be edited.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">VAT</h2>
        <p className="text-gray-600 mb-3">
          Every offer says whether it carries VAT: <strong>VAT 14% included: &lt;amount&gt;</strong> or{' '}
          <strong>VAT not applied</strong>, on the list, on the offer page and in the email and WhatsApp message.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Tick <strong>Apply VAT (14%)</strong> in New offer, or on the offer page. It is off unless you tick it.</li>
          <li>VAT is added on top of the selling price at your company&apos;s rate (Settings &rsaquo; Company Profile), rounded to the currency, but not on extras or insurance. An offer is priced from its trip&apos;s supplier cost, so the part left out is the trip&apos;s Extra lines&apos; share of that cost, applied to the price: VAT = (price &minus; price &times; extras cost &divide; trip cost) &times; rate. The page and the message then also show the total including VAT.</li>
          <li>When something was left out, the VAT line says <strong>VAT 14% included: &lt;amount&gt; (extras and insurance not taxed)</strong> (in Japanese 「…（オプション・保険はVAT対象外）」).</li>
          <li>The rate, the amount and the amount it was charged on are recorded on the offer. A re-price while VAT is on works it out again on the new price at the rate the offer recorded; a later change of the company rate does not touch it.</li>
          <li>Offers made before extras were left out (13 October 2026) keep the VAT they recorded, on the whole price, until they are re-priced or VAT is switched again.</li>
          <li>A booked offer keeps its VAT, and booking it passes its VAT choice and rate to the trip.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It does not cost a different party size. The traveller count is the itinerary&apos;s.</li>
          <li>It does not convert currencies. The offer is in the itinerary&apos;s currency.</li>
          <li>No offer is set to Expired by a schedule; an open offer reads as Expired once its date has passed.</li>
          <li>There is no PDF of a B2C offer; the email and WhatsApp message give the total, the price per person (before VAT) and the VAT line.</li>
        </ul>
      </section>
    </div>
  )
}
