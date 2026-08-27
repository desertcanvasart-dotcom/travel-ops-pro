import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function TravellerPortalPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Traveller Portal</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Traveller Portal</h1>
      <p className="text-gray-600 mb-8">
        The portal is the page your customers see. You send them a link; they fill in their own
        details, attach their passport, and ask questions. It replaces the 海外旅行参加申込書 you
        used to post out and chase.
      </p>

      <Tip>
        There is no account and no password. The link itself is the credential, so a traveller
        opens it on their phone and starts typing.
      </Tip>

      {/* Sending the link */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Sending the link</h2>
        <p className="text-gray-600 mb-3">
          Open the booking and find the <strong>Customer portal</strong> panel. Choose how the
          party will fill it in:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>Family</strong> &mdash; one link for the whole booking. The lead traveller
            fills in everyone&rsquo;s details. Use this for a couple or a family travelling together.
          </li>
          <li>
            <strong>Friends</strong> &mdash; a separate private link for each traveller. Each
            person fills in only their own details, and cannot see anyone else&rsquo;s. Use this
            when the party are not related, or when somebody would rather their passport and
            medical details stayed private.
          </li>
        </ul>
        <p className="text-gray-600 mt-3">
          Press <strong>Copy</strong> to take the link, or <strong>Send</strong> to email it
          straight to that traveller. The panel shows who has completed their form, so your chase
          list is the same screen.
        </p>
        <ScreenshotPlaceholder caption="Customer portal panel on a booking, showing the family/friends toggle and the traveller roster" />
      </section>

      {/* The gate */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How it stays private</h2>
        <p className="text-gray-600 mb-3">
          Before the portal shows anything, the visitor confirms one fact only the traveller
          knows:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>On a <strong>family</strong> link &mdash; the booking number, or the lead
            traveller&rsquo;s family name</li>
          <li>On a <strong>private</strong> link &mdash; that traveller&rsquo;s family name
            <em>and</em> their date of birth</li>
        </ul>
        <p className="text-gray-600 mt-3">
          This matters because links get forwarded. Someone who receives the URL by accident
          still cannot open it.
        </p>
        <Tip>
          A private link needs the traveller&rsquo;s date of birth on file before it will let
          anyone in. If you have not entered it, the link will refuse everybody &mdash; including
          the right person. Seed it in the roster first.
        </Tip>
      </section>

      {/* What the traveller does */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What the traveller sees</h2>
        <p className="text-gray-600 mb-3">The page is in Japanese, and covers:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Their trip, dates and party size</li>
          <li>What they have paid and what is still due</li>
          <li>The participation form &mdash; names in kanji, kana and roman letters, passport
            details, address, emergency contact</li>
          <li>Passport and document attachments &mdash; see{' '}
            <Link href="/docs/passport-documents" className="text-primary-600 hover:underline">
              Passport &amp; Documents
            </Link>
          </li>
          <li>Travel insurance selection, with premiums priced from your published table</li>
          <li>A message thread to your office &mdash; see{' '}
            <Link href="/docs/portal-messages" className="text-primary-600 hover:underline">
              Portal Messages
            </Link>
          </li>
        </ul>
        <p className="text-gray-600 mt-3">
          The form checks as they type. It refuses a passport that expires within six months of
          arrival, which is what Egypt requires, and it refuses Japanese characters typed into the
          roman-letter boxes &mdash; the slip that stops somebody boarding.
        </p>
        <ScreenshotPlaceholder caption="The traveller's form on a phone, showing the passport section" />
      </section>

      {/* Lead coordinator */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Letting the lead run the party</h2>
        <p className="text-gray-600 mb-3">
          In friends mode, the lead traveller sees a coordinator panel on their own page. They can
          add each friend&rsquo;s name, date of birth and contact, send that person their private
          link, and watch who has finished &mdash; without ever seeing anyone&rsquo;s passport or
          medical answers.
        </p>
        <p className="text-gray-600">
          This is usually faster than you chasing five people yourself.
        </p>
      </section>

      {/* Locking */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Locking the details</h2>
        <p className="text-gray-600 mb-3">
          Once the manifest has gone to Cairo, lock it. Travellers can still open their link and
          read what they submitted, but not change it &mdash; so what you hold and what was sent
          cannot drift apart.
        </p>
      </section>

      {/* Extra travellers */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">If the party grows</h2>
        <p className="text-gray-600 mb-3">
          A traveller cannot quietly add people. Asking for another place raises a{' '}
          <strong>change request</strong> on the booking for you to approve or refuse. Approving
          it adds the traveller and re-prices the booking by extending the per-person price the
          customer already agreed &mdash; payments already made are preserved.
        </p>
        <Tip>
          The re-price is linear, so it does not discount costs the group shares, like a guide or
          a vehicle. It errs slightly in your favour; adjust in pricing if the group shares fixed
          costs.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Next</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><Link href="/docs/passport-documents" className="text-primary-600 hover:underline">Passport &amp; Documents</Link> &mdash; what travellers can attach, and when it is deleted</li>
          <li><Link href="/docs/portal-messages" className="text-primary-600 hover:underline">Portal Messages</Link> &mdash; answering questions from the portal</li>
          <li><Link href="/docs/bookings" className="text-primary-600 hover:underline">Bookings</Link> &mdash; where the portal panel lives</li>
        </ul>
      </section>
    </div>
  )
}
