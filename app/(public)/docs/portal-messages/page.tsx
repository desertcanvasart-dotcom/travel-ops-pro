import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function PortalMessagesPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Portal Messages</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Portal Messages</h1>
      <p className="text-gray-600 mb-8">
        Travellers can ask questions from their own booking page, and your team answers from the
        unified inbox. The question and the answer stay attached to the trip they are about,
        instead of living in somebody&rsquo;s email.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The traveller asks</h2>
        <p className="text-gray-600 mb-3">
          Under <strong>お問い合わせ</strong> on their portal page. Before they send, they can see
          your office hours; if nobody is in, they are told when the next office opens, in their
          own time zone.
        </p>
        <p className="text-gray-600">
          Their first message gets an automatic acknowledgement confirming it arrived. Later
          messages do not repeat it.
        </p>
        <ScreenshotPlaceholder caption="The message thread on a traveller's page, showing office hours above the box" />
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">You answer</h2>
        <p className="text-gray-600 mb-3">Two places, and they are the same conversation:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>Unified Inbox</strong> &mdash; portal conversations sit beside WhatsApp and
            email, under the <strong>Portal</strong> tab. This is the one to watch.
          </li>
          <li>
            <strong>The booking page</strong> &mdash; a Messages panel, useful when you are
            already looking at the trip.
          </li>
        </ul>
        <p className="text-gray-600 mt-3">
          When you reply, the traveller is emailed a link back to their page. The email does not
          repeat what you wrote &mdash; the conversation may concern a passport or a payment, and
          email is the less private channel of the two.
        </p>
        <Tip>
          The panel tells you whether that email actually went. If it says no, the traveller has
          no email address on file and will only see your reply if they reopen their link.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Whose conversation is it</h2>
        <p className="text-gray-600 mb-3">
          The same rule as the rest of the portal: it follows the link.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>A <strong>family</strong> link opens one conversation for the whole party</li>
          <li>A <strong>private</strong> link opens that traveller&rsquo;s own conversation, which
            nobody else on the booking can read</li>
        </ul>
        <p className="text-gray-600 mt-3">
          In the inbox each conversation is labelled, so you can see at a glance whether you are
          answering the whole party or one person privately.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Setting your office hours</h2>
        <p className="text-gray-600 mb-3">
          Hours are held per office, each with its own working week and time zone, so a team
          split across countries is described accurately rather than averaged. A traveller is
          told when <em>any</em> office will next be open.
        </p>
        <Tip>
          A chat box is a promise that somebody is reading it. Decide who watches the Portal tab,
          and when, before you send the first link &mdash; an unanswered message is worse than no
          message box at all.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Current limits</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>The traveller starts the conversation. You cannot open one and write first &mdash;
            use email or WhatsApp for that.</li>
          <li>Messages are text only. Files go through{' '}
            <Link href="/docs/passport-documents" className="text-primary-600 hover:underline">
              document attachments
            </Link> instead.</li>
          <li>Portal conversations are not assigned to an agent the way WhatsApp and email
            conversations are.</li>
        </ul>
      </section>
    </div>
  )
}
