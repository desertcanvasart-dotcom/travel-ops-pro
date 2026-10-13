import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function PricingGridPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Quote Builder</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Quote Builder</h1>
      <p className="text-gray-600 mb-8">
        The Quote Builder prices a trip day by day. You pick services from your rates for each day, and the screen
        shows the cost and the selling price as you go. When the quote is ready you save it as an itinerary (B2C) or
        as a B2B quote.
      </p>

      {/* Where and who */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where to find it and who can use it</h2>
        <p className="text-gray-600 mb-3">
          Open it from <strong>Sell &rsaquo; Quote Builder</strong>. The menu shows it to owners, admins, managers and
          agents. Viewers do not have it.
        </p>
        <p className="text-gray-600">
          You also reach it from a conversation in the inbox (the parse buttons send the conversation here to be
          priced) and from an itinerary&rsquo;s editor, which opens the Quote Builder with that itinerary loaded.
        </p>
      </section>

      {/* Header */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The header</h2>
        <p className="text-gray-600 mb-3">The <strong>Trip</strong> group:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li><strong>Pax</strong> &mdash; the group size, 1 to 50.</li>
          <li><strong>Start</strong> &mdash; the departure date. Each day is priced on its own date.</li>
          <li><strong>EU / Non-EU</strong> &mdash; which passport price to use for fees, guides, activities and cruises.</li>
          <li><strong>Tier</strong> &mdash; the hotel and cruise tier, from Settings &rsaquo; Vocabulary. Changing it swaps each day&rsquo;s hotel for one in the same city in the new tier, and the cruise for the first cruise of that tier.</li>
        </ul>
        <p className="text-gray-600 mb-3">The <strong>Pricing</strong> group:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>B2C / B2B</strong> &mdash; who the quote is for. B2B shows <strong>Select Partner&hellip;</strong>; picking a partner sets the markup to that partner&rsquo;s default margin (at most 100). Switching between B2C and B2B resets the markup to your default margin (your own, else the company&rsquo;s).</li>
          <li><strong>Guide / No Guide</strong> &mdash; with no guide, the guide and the guide&rsquo;s tips are left out.</li>
          <li><strong>Spot / Throughout</strong> &mdash; shown when there is a guide (named in your words from Settings &rsaquo; Vocabulary). See &ldquo;Throughout guide&rdquo; below.</li>
          <li><strong>Guide language</strong> &mdash; one language for the whole trip. Changing it moves every day&rsquo;s guide to a guide in that language, where the city has one.</li>
          <li><strong>Currency</strong> &mdash; USD, EUR, GBP, EGP or JPY. This is only the currency the figures are <em>shown</em> in. See &ldquo;Currencies&rdquo; below.</li>
          <li><strong>Markup %</strong> &mdash; 0 to 100, added on top of cost.</li>
        </ul>
      </section>

      {/* Starting */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Starting a quote</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Package Type</strong> &mdash; what the customer is buying. It decides which services each day needs.</li>
          <li><strong>Paste Text</strong> &mdash; paste a conversation, an email or a programme and press <strong>Parse &amp; Generate Quote</strong>. The AI builds the days and picks services from your rates. If the text is too vague to parse, it suggests an itinerary instead and the screen says &ldquo;AI-suggested itinerary based on inquiry &mdash; review and adjust as needed&rdquo;. The number of travellers it finds becomes the pax.</li>
          <li><strong>Upload File</strong> &mdash; a PDF, image or DOCX; the AI reads the text from it.</li>
          <li><strong>Load / Build</strong> &mdash; type an itinerary ID and load it, add an empty day, or clear all days.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Your work is kept in this browser as you go, so a refresh does not lose it. Prices are not kept from the
          draft: every pick is priced again from your rates when the page opens.
        </p>
      </section>

      {/* Days */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Days and services</h2>
        <p className="text-gray-600 mb-3">
          Each day has a day type (arrival, sightseeing, travel, cruise, free, departure) and a fixed list of services.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Paid once for the group</strong> &mdash; Transport, Guide, Airport Services, Hotel Services, Tipping, Boat Rides, Other (Group).</li>
          <li><strong>Paid per person</strong> &mdash; Accommodation, Entrance Fees, Flights, Experiences, Meals, Water, Nile Cruise, Other (PP).</li>
        </ul>
        <p className="text-gray-600 mb-3">
          Airport services, hotel services, boat rides and experiences follow their own rate&rsquo;s basis instead:
          per group, per person or per unit (for example a boat of 6).
        </p>
        <p className="text-gray-600 mb-3">
          <strong>Transport</strong> lists each route once, at the vehicle for the group: the list says &ldquo;Each route once,
          at the vehicle for N pax&rdquo;. When the pax changes, every picked route moves to the vehicle that seats the new
          group, and the price follows.
        </p>
        <p className="text-gray-600">
          Picking a hotel fills the day&rsquo;s meals from its board basis (lunch and dinner for BB, lunch for HB, none
          for FB or AI), from the meal rates of the day&rsquo;s city. <strong>Water</strong> can be copied to every day.
        </p>
      </section>

      {/* How totals are computed */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How the figures are worked out</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li>Every pick is priced from the rate it names, as your rates hold it now. A pick whose rate has been deleted or switched off has <strong>no price</strong>: it counts as 0 and the screen lists it under &ldquo;No current rate, so no price&rdquo;. Pick another rate or type an amount.</li>
          <li>Each day is priced at the rate period that covers its date. A date that no period covers has no price, and an amber note names the periods that exist.</li>
          <li>A day&rsquo;s cost is its group services plus its per-person services &times; pax. The day card shows it per person (group costs &divide; pax) and in total.</li>
          <li>The single supplement is charged only when pax is 1. A hotel&rsquo;s other supplements (a view, a meal plan) are charged to everyone, per night.</li>
          <li>A typed amount in a service replaces its picks. Group amounts are paid once, per-person amounts &times; pax.</li>
          <li><strong>Total cost</strong> is the sum of all days. <strong>Selling total</strong> is total cost &times; (1 + markup), rounded once at the end (to whole yen for a yen company), plus the season premium.</li>
          <li><strong>Season premium</strong>: when the departure date falls in one of your seasons (Settings &rsaquo; Seasonal Premiums), its percentage is added on top of the selling total. A band shows &ldquo;Season +N% &middot; +amount &middot; on an ordinary date amount&rdquo;.</li>
          <li><strong>Water</strong> is EUR 0.50 per person per day, converted into your rate currency. If there is no exchange rate for that, water has no price and its line says so.</li>
        </ul>
        <p className="text-gray-600">
          The header strip (<strong>Cost/PP</strong>, <strong>Total Cost</strong>, <strong>Margin (N%)</strong>, <strong>Sell/PP</strong>,{' '}
          <strong>Sell Total</strong>) and the summary at the bottom (<strong>Cost / person</strong>, <strong>Total cost</strong>,{' '}
          <strong>Margin (N%)</strong>, <strong>Selling / person</strong>, <strong>Selling total</strong>) show the same figures.
        </p>
      </section>

      {/* Throughout guide */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Throughout guide</h2>
        <p className="text-gray-600 mb-3">
          With <strong>Throughout</strong>, the guide travels with the group and his own costs are added as group costs: his bed
          each night (the &ldquo;guide bed&rdquo; rate on the hotel or cruise period), a seat on each flight (the guide fare,
          else the passenger fare), and his meals when the group is 3 or fewer. With <strong>Spot</strong>, the guide is only what
          the Guide service holds.
        </p>
        <Tip>
          If a chosen hotel or cruise has no guide bed rate, an amber note says how many nights are missing his bed. The bed is
          not priced until you enter it on the rate.
        </Tip>
      </section>

      {/* Currencies */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Currencies</h2>
        <p className="text-gray-600 mb-3">
          Your rates are kept in your company&rsquo;s <strong>rate currency</strong> (Settings &rsaquo; Company profile). Every
          figure is worked out in it. The service lists show prices in the rate currency.
        </p>
        <p className="text-gray-600 mb-3">
          The <strong>Currency</strong> menu converts the day cards and the totals from the rate currency into the currency you
          pick, at the app&rsquo;s exchange rates (your exchange-rate table, then the ECB rates). If there is no rate for that
          currency, the figures stay in the rate currency, with its sign, and a note says &ldquo;No exchange rate from&nbsp;&hellip;&rdquo;.
        </p>
        <p className="text-gray-600">
          The saved itinerary is always stored in the rate currency. If you were looking at another currency, the save message
          says &ldquo;Amounts are stored in &hellip;, the currency your rates are in.&rdquo;
        </p>
      </section>

      {/* Saving */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Saving</h2>
        <p className="text-gray-600 mb-3">
          The button reads <strong>Save as Itinerary</strong> or <strong>Update Itinerary</strong> for B2C, and{' '}
          <strong>Save as B2B Quote</strong> or <strong>Update B2B Quote</strong> for B2B.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li>The save prices every line again from your rates, by the rate each pick names, with the vehicle for the group. It does not take the prices the screen sent. So the stored total is the same as the screen&rsquo;s Selling total when your rates have not changed since the page loaded.</li>
          <li>The itinerary&rsquo;s total is the Selling total, including the season premium. Each service line also stores its own cost and price (line &times; markup); the lines can add up to a cent or two away from the total, which is the quote.</li>
          <li>A conversation from the inbox that matched a client links the itinerary to that client.</li>
          <li>For B2B, the save stores the partner and the partner&rsquo;s commission, then creates a B2B quote and a tour template and opens the B2B calculator.</li>
          <li>If a client email is one of your own office addresses, it is not saved, and the message says so.</li>
        </ul>
        <p className="text-gray-600">
          After saving, <strong>View Itinerary</strong> (or <strong>View B2B Quote</strong>) opens what was saved.
        </p>
      </section>

      {/* Not */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It does not add VAT or any tax line. A flight&rsquo;s price is its fare plus its tax, and the markup is applied to both.</li>
          <li>It does not store the quote in the currency you were viewing; the itinerary is in the rate currency.</li>
          <li>It does not guess a price: a pick with no current rate, a date outside every rate period, or water without an exchange rate has no price until you fix it.</li>
          <li>It does not block a save when a day is missing a service; it saves a draft.</li>
          <li>A typed amount is taken as it is, in the rate currency.</li>
        </ul>
      </section>
    </div>
  )
}
