import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function OrderIntakePage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Order Intake</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Order Intake</h1>
      <p className="text-gray-600 mb-4">
        Order Intake turns a website order (the tour-up.jp order email, or anything in its label-and-value shape) into
        one priced draft <Link href="/docs/b2b-quotes" className="text-primary-600 hover:underline">B2B quote</Link>,
        with the customer as a client. It lives under <strong>Sell &rsaquo; Order Intake</strong>.
      </p>
      <p className="text-gray-600 mb-8">
        Admins, managers and agents see it in the menu (the owner always does).
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reading an order</h2>
        <p className="text-gray-600 mb-3">
          Paste the order email and press <strong>Read the order</strong>. Nothing is written yet. The preview shows:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>Programme</strong>: the tour code, the website page, the programme it matched (by website page first,
            then by tour code, among your company&apos;s active programmes), the departure date, the party, and whether
            you run that date as a departure. When you do, it shows the seats still free, or warns that there are too
            few for this party.
          </li>
          <li><strong>Traveller</strong>: name, birth date, contact, whether the client already exists (found by email) or is new, and the companions.</li>
          <li><strong>Requests</strong>, when the customer wrote any.</li>
          <li>
            <strong>Price</strong>: the website&apos;s subtotal or base fare in yen (as the email gives it, for you to
            compare), then <strong>Cost</strong>, <strong>Selling</strong> (with the margin) and{' '}
            <strong>Per person</strong>. These are worked out by the server at the standard tier, with a Japanese-speaking
            guide, non-EU passports, lunch only, your company&apos;s default margin and its rate currency. Services that
            could not be priced are listed.
          </li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Creating the quote</h2>
        <p className="text-gray-600 mb-3">
          <strong>Create the draft quote</strong> (or <strong>Create client and draft quote</strong> for a new customer)
          writes:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>the client, if new;</li>
          <li>a standard variation of the programme, if it has none;</li>
          <li>a draft B2B quote, valid for 30 days, with the order&apos;s details in its notes;</li>
          <li>
            a <strong>pending</strong> seat hold on that date&apos;s departure, when you run one and the party fits the
            seats left. Seats left are the departure&apos;s maximum less the larger of its booked count and its
            confirmed holds, less its pending holds. When the party does not fit, the quote is still made, no seats are
            held, and the result says how many were free.
          </li>
        </ul>
        <p className="text-gray-600 mt-3">The result links to the quote.</p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Orders from your website, with no click</h2>
        <p className="text-gray-600 mb-3">
          When your website emails you each order, connect that mailbox under{' '}
          <Link href="/docs/email-inbox" className="text-primary-600 hover:underline">Email Inbox</Link>. After each
          mailbox sync, every new order email is read once and taken through the same steps, with the same seat rule.
          Managers are notified with a link to the quote (and told when no seats could be held).
        </p>
        <p className="text-gray-600 mb-3">
          Give each programme its website page under{' '}
          <Link href="/docs/tour-programs" className="text-primary-600 hover:underline">Tour Programs</Link> so an order
          finds it even when the website&apos;s tour code is spelled differently from yours.
        </p>
        <p className="text-gray-600 mb-3">
          The <strong>Website orders</strong> table at the bottom shows the newest 50: when each arrived, its tour code,
          departure, customer, and the result (<em>Quote created</em>, <em>Needs attention</em> with the reason,{' '}
          <em>Duplicate</em> for the same order sent twice, or <em>Dismissed</em>). A finished order links to its quote.
          An open one has <strong>Finish</strong>, which opens it here with the email filled in, and{' '}
          <strong>Dismiss</strong>, for an order you dealt with another way.
        </p>
        <Tip>
          An order can be finished once. Opening a finished or dismissed order&apos;s link again and confirming is
          refused, so a second quote and a second seat hold are never made from it.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The hosted order form</h2>
        <p className="text-gray-600">
          Customers can also order on your hosted <strong>/order</strong> page. It runs the same steps. The customer is
          told the order was received and given the quote number as a reference, never your cost or margin. An order
          that cannot be finished automatically is still received, and managers are notified with a link to finish it
          here.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>It reads only the tour-up.jp order shape. Other free text is refused as not an order.</li>
          <li>It does not create an itinerary or a booking. Convert the quote when the customer confirms.</li>
          <li>It does not confirm a seat hold or change the departure&apos;s booked count; confirm holds on the departure.</li>
          <li>It prices at the standard tier with the defaults above; change anything else by pricing the tour in the calculator.</li>
          <li>The seat check is made when the order is processed; two orders for the last seats at the same moment can both be held.</li>
        </ul>
      </section>
    </div>
  )
}
