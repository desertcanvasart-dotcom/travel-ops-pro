import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function B2BQuotesPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">B2B Quotes</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">B2B Quotes</h1>
      <p className="text-gray-600 mb-4">
        A B2B quote is a priced tour programme for a partner or a group: the services, the price for the party and the
        date, and the client&apos;s details, with a PDF you can send. It lives under <strong>Sell &rsaquo; B2B Quotes</strong>.
      </p>
      <p className="text-gray-600 mb-8">
        Admins, managers and agents see it in the menu (the owner always does). Agents can create, edit and convert
        quotes; deleting a quote is for managers and above.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where quotes come from</h2>
        <p className="text-gray-600 mb-3">
          Not from this page. <strong>New Quote from Tour</strong> opens the tour manager, because a quote starts from a
          tour variation. A quote is made in one of three places:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>
            The <Link href="/docs/b2b-pricing" className="text-primary-600 hover:underline">B2B price calculator</Link>:
            price the tour, then <strong>Save as Quote</strong> with an optional partner, client details and notes.
          </li>
          <li>The <Link href="/docs/pricing-grid" className="text-primary-600 hover:underline">Pricing Grid</Link>, from an itinerary. Its quote links back to that itinerary.</li>
          <li><Link href="/docs/order-intake" className="text-primary-600 hover:underline">Order Intake</Link>, from a website order.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          The price is always worked out by the server. When you save from the calculator, the server prices the quote
          again with the same inputs (the party, date, passport, margin, tier, guide, tour leader, and the chosen options
          and extras) and stores its own figures, services and season premium. If its price differs from the one on
          your screen (a rate or a season was changed in between), the save is refused and you are asked to calculate
          again. A new quote is a <strong>Draft</strong> and is valid for 30 days.
        </p>
        <p className="text-gray-600 mt-3">
          The margin: until you change it in the calculator, the server picks it. With a partner chosen in the save
          dialog, that is the partner&apos;s default margin (from <strong>Partners</strong>), or a margin stored for that
          partner on this tour variation when there is one; without a partner, or for a partner whose margin is 0, it is your company&apos;s default
          margin, else 25%. Choosing a partner prices the tour again at once, so the price in the dialog is the price
          saved. A margin you set yourself is always used, partner or not.
        </p>
        <p className="text-gray-600 mt-3">
          Quote numbers run per company and per year: QT-2026-00001, QT-2026-00002 and so on. Your numbers do not skip
          when another company on the same installation makes a quote, and two quotes saved at the same moment get two
          numbers. A quote number cannot be changed.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The list</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>Total, Draft, Sent, Accepted</strong>: counts over all of your company&apos;s quotes, whatever the
            filter or search shows. Draft and Sent leave out offers whose valid-until date has passed.
          </li>
          <li>
            <strong>Status filter</strong>: All, Draft, Sent, Accepted, Rejected, Expired, Converted. Expired includes
            draft and sent offers whose date has passed.
          </li>
          <li><strong>Search</strong>: quote number, client, template, trip name or partner, within the newest 100 quotes loaded.</li>
          <li>
            <strong>Each row</strong>: quote number and date created, the tour, client and partner, pax (+1 for a tour
            leader), travel date, the selling price and the price per person in the quote&apos;s own currency, the
            languages it has versions in, and its status. Actions: View, PDF, Delete.
          </li>
        </ul>
        <p className="text-gray-600 mt-3">
          Tick quotes to act on several at once (managers and above). <strong>Set status&hellip;</strong> then{' '}
          <strong>Apply</strong> changes their status; <strong>Delete</strong> removes them. Converted and booked quotes
          are skipped by both, and an offer past its valid-until date is not set to Accepted; you are told how many were
          skipped.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">A quote</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Header</strong>: number and status, <strong>View Itinerary</strong> for a quote made from one, and <strong>Download PDF</strong>.</li>
          <li><strong>Tour</strong>: name, variation, tier, days and nights, travellers (with tour leader and guide options), travel date, season.</li>
          <li>
            <strong>Services included</strong>: day by day, each line with quantity, unit price and total. A line with
            no rate is shown in red, and a banner at the top lists them.
          </li>
          <li><strong>Notes</strong>: per language (English and Japanese). A missing language can be created blank, or copied and machine-translated.</li>
        </ul>
        <p className="text-gray-600 mt-3 mb-2"><strong>Pricing</strong>, all in the quote&apos;s own currency (yen without decimals):</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Subtotal</strong>: the cost of the services.</li>
          <li><strong>Margin (x%)</strong>: the margin on that cost.</li>
          <li><strong>Tour leader cost</strong>, when a tour leader is included.</li>
          <li><strong>Season premium</strong>: the season&apos;s percentage on top, when the travel date falls in one of your seasons.</li>
          <li><strong>Selling price</strong>: what the partner pays, with the figures above inside it; and the price per person.</li>
          <li><strong>Single supplement</strong>, when there is one.</li>
        </ul>
        <p className="text-gray-600 mt-3 mb-2">In the side panel:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Client details</strong> and <strong>Partner</strong>.</li>
          <li>
            <strong>Update status</strong>: Draft, Sent, Accepted, Rejected. An offer whose valid-until date has passed
            shows as <strong>Expired</strong> and cannot be accepted until you move the date on.
          </li>
          <li>
            <strong>Convert to itinerary</strong>, once accepted. A template quote becomes a new itinerary dated from the
            travel date (you are asked for a first day if it has none); its service lines add up, with its season
            premium, to the quote&apos;s selling price. A quote made from an itinerary updates that itinerary&apos;s
            price instead. Services with no rate are refused unless you confirm.
          </li>
          <li>
            <strong>Convert to booking</strong>, once accepted (and still after converting). The booking total is the
            quote&apos;s selling price in its currency; the deposit percentage starts from Settings &rsaquo; Payment terms.
          </li>
          <li><strong>Valid until</strong>, which you can change until the quote is converted or booked.</li>
          <li>
            <Link href="/docs/quote-revisions" className="text-primary-600 hover:underline">Revision history</Link>: every
            change, compare with the current version, and revert (managers and above).
          </li>
        </ul>
        <Tip>
          Once a quote is converted or a booking is made from it, it is the record of what was sold. Its price, status,
          client details and validity no longer change, and it cannot be deleted. Its notes can still be edited.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The PDF</h2>
        <p className="text-gray-600">
          In the language you are using the app in, on your company letterhead. It shows the services and their
          quantities, the total and the price per person (never cost or margin), the tour leader, the single supplement,
          the notes and terms, and your payment rule (deposit percentage and when the balance is due, from Settings). A
          quote with unpriced services asks before it makes the PDF.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">VAT</h2>
        <p className="text-gray-600 mb-3">
          Every quote says whether it carries VAT: <strong>VAT 14% included: &lt;amount&gt;</strong> or{' '}
          <strong>VAT not applied</strong>, on the list, on the quote page and on the PDF.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Tick <strong>Apply VAT (14%)</strong> when you save a quote from the calculator, or on the quote page. It is off unless you tick it.</li>
          <li>VAT is added on top of the selling price, but not on extras or insurance: VAT = (selling price &minus; the extras&apos; share of it) &times; your company&apos;s rate (Settings &rsaquo; Company Profile, 14% unless an administrator changes it), rounded to the currency (whole yen for JPY). An extra&apos;s share is its set price, or its cost at the quote&apos;s margin, plus any season premium. The extras are catalogue extras chosen in the calculator, and on a quote made from a trip, the trip&apos;s lines of type Extra. The page and the PDF then show the net price (extras included), the VAT and the total including VAT.</li>
          <li>When a quote has extras, its VAT line says so: <strong>VAT 14% included: &lt;amount&gt; (extras and insurance not taxed)</strong>, in Japanese 「VAT（14%）適用：…（オプション・保険はVAT対象外）」.</li>
          <li>The rate, the amount and the amount it was charged on are recorded on the quote when VAT is switched on. Changing the company rate later does not change a quote already made.</li>
          <li>Quotes priced before extras were left out (13 October 2026) keep the VAT they recorded, on the whole selling price. Switching VAT off and on again on such a quote works it out under the current rule.</li>
          <li>A converted or booked quote keeps its VAT. Converting a quote passes its VAT choice and rate to the trip, and the trip&apos;s invoice starts with VAT on when the trip has it.</li>
          <li>Reverting to an earlier revision brings back that revision&apos;s VAT with its price.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>You cannot change a quote&apos;s price, party or travel date here. Price it again in the calculator and save a new quote.</li>
          <li>No quote is set to Expired by a schedule. An open offer simply reads as Expired once its date has passed.</li>
          <li>Search covers only the newest 100 quotes loaded; the counts cover all of them.</li>
          <li>Quotes made by the order intake are saved without VAT; switch it on from the quote page.</li>
          <li>The price per person and the single supplement are shown before VAT.</li>
          <li>A quote cannot be sent by email from this page; download the PDF and send it yourself.</li>
        </ul>
      </section>
    </div>
  )
}
