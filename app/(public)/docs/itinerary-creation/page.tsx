import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function ItineraryCreationPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Itinerary Creation</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Itinerary Creation</h1>
      <p className="text-gray-600 mb-8">
        A trip can start in three places: the <strong>New Itinerary</strong> form, the <strong>WhatsApp to Itinerary</strong>{' '}
        page (AI writes the day plan from a conversation), or the{' '}
        <Link href="/docs/pricing-grid" className="text-primary-600 hover:underline">Quote Builder</Link>. Admins, managers
        and agents can create trips from the first two (the owner always can); the Quote Builder is for managers and above.
      </p>

      {/* New Itinerary */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">New Itinerary</h2>
        <p className="text-gray-600 mb-3">
          <strong>Sell &rsaquo; Itineraries &rsaquo; New Itinerary</strong> (or from a client&apos;s page, which fills in the
          client). The form asks for:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li>Client name, email and phone; trip name; start and end date (both required)</li>
          <li>Adults, children (ages 4&ndash;12) and infants</li>
          <li>
            <strong>Currency</strong> &mdash; filled with your own preference, else your company&apos;s default currency.
            Left blank, the server uses the company&apos;s default currency, or the company&apos;s rate currency when it has
            none.
          </li>
          <li>A programme (optional: it sets the length and lets the extras catalogue offer that programme&apos;s options) and notes</li>
        </ul>
        <p className="text-gray-600">
          <strong>Create Itinerary</strong> makes a <strong>draft</strong> at zero with a code like ITN-2026-4821 and an English
          version, and opens it. Only these fields are taken from the form: the status, prices, payments and exchange rates of
          a new trip are never set from the request. A client, programme or destination that is not your company&apos;s own is
          refused (&ldquo;Client not found&rdquo;).
        </p>
      </section>

      {/* WhatsApp */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">WhatsApp to Itinerary</h2>
        <p className="text-gray-600 mb-3">
          Opened from a WhatsApp conversation (the conversation and the client come with it), or directly at
          /whatsapp-parser. Paste the conversation, <strong>Analyze with AI</strong>, check the extracted details, confirm
          the client, then generate.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>Follow My Plan</strong> follows a day-by-day plan you pasted; <strong>Let AI Create</strong> suggests one
            from the interests, cities and length.
          </li>
          <li>
            The trip is an <strong>unpriced draft</strong> by default, to be revised and then priced in the Quote Builder.
          </li>
          <li>
            <strong>Currency</strong>: your own preference in this company, else the company&apos;s default currency, else
            its rate currency. A traveller&apos;s passport never changes it &mdash; the passport only picks the EU or non-EU
            price for entrance fees. The margin follows the same order (yours, else the company&apos;s, else 25%).
          </li>
          <li>
            The trip is linked to your company&apos;s conversation and client. A client, partner, destination or conversation
            of another company is refused before any AI work starts.
          </li>
          <li>
            Pressing generate twice, or generating again from the same conversation, returns the trip already made (only your
            company&apos;s).
          </li>
          <li>Codes look like ITN-S-2026-4821 (the letter is the tier). A code that is already taken is drawn again.</li>
        </ul>
        <Tip>
          When no client is chosen, a new trip is linked to your company&apos;s client with the same email &mdash; or, failing
          that, the only client with the same full name. Another company&apos;s clients are never matched.
        </Tip>
      </section>

      {/* After */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">After creating</h2>
        <p className="text-gray-600">
          Edit the days and services in the editor, price the trip (Quote Builder, or the editor&apos;s lines), send it, then
          confirm it &mdash; which creates the booking. See{' '}
          <Link href="/docs/itineraries" className="text-primary-600 hover:underline">Itineraries</Link> and{' '}
          <Link href="/docs/bookings" className="text-primary-600 hover:underline">Bookings</Link>.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>The New Itinerary form does not add days or services; the trip starts empty.</li>
          <li>WhatsApp to Itinerary does not price the trip unless the caller asks it to; the draft is priced afterwards.</li>
          <li>Itinerary codes are unique across the whole install, not numbered per company.</li>
        </ul>
      </section>
    </div>
  )
}
