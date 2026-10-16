import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

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
        Travellers can ask questions from their own booking page, and your team answers from the Unified Inbox or the
        booking. The question and the answer stay attached to the booking they are about. Admins, managers and agents
        answer them (the owner always can); viewers cannot.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The traveller asks</h2>
        <p className="text-gray-600 mb-3">
          Under <strong>お問い合わせ</strong> on their portal page (the portal is in Japanese). A message can be up to 4,000
          characters. The page checks for your reply every 30 seconds while it is open.
        </p>
        <p className="text-gray-600 mb-3">
          If office hours are set for your company, they are listed above the box, and outside them the traveller is told
          when the next office opens. Times are always given in Japan time.
        </p>
        <p className="text-gray-600">
          The first message in a conversation gets an automatic acknowledgement that it arrived (with the next opening
          time when nobody is in). Later messages do not repeat it. Your company&apos;s owner, admins and managers get an
          in-app notification, <strong>New portal message</strong>, that opens the booking. No email is sent for it.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">You answer</h2>
        <p className="text-gray-600 mb-3">Two places, and they are the same conversation:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>
            <strong>Communicate &rsaquo; Unified Inbox</strong>, under the <strong>Portal</strong> tab. A conversation
            is unread while the traveller&apos;s last message is newer than the last time someone on your team opened it.
            Opening it marks it read.
          </li>
          <li>
            <strong>The booking page</strong> &mdash; a Messages panel, useful when you are already looking at the trip.
            It refreshes every minute while the page is in view.
          </li>
        </ul>
        <p className="text-gray-600 mt-3">
          When you reply, the traveller is emailed a link back to their page, from your company&apos;s Gmail mailbox. The
          email does not repeat what you wrote: the conversation may concern a passport or a payment, and email is the
          less private channel. A private conversation emails that traveller (or the booking&apos;s contact if they have
          no address) with their own private link; the shared conversation emails the booking&apos;s contact with the
          shared link.
        </p>
        <Tip>
          After you send, a notice says when the email did not go, and why: nobody on the booking has an email address;
          the booking has no active portal link for that conversation; no Gmail is connected for your company (an admin
          or manager connects it in Settings &rsaquo; Email); or the send failed. Your reply is saved either way.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Whose conversation is it</h2>
        <p className="text-gray-600 mb-3">
          It follows the link the traveller used:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>A <strong>family</strong> link opens one conversation for the whole party.</li>
          <li>A <strong>private</strong> link opens that traveller&rsquo;s own conversation, which nobody else on the booking can read.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          In the inbox each conversation is labelled &ldquo;whole party&rdquo; or &ldquo;(private)&rdquo; after the trip
          name, so you can see whom you are answering.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Office hours</h2>
        <p className="text-gray-600">
          Hours are held per office, each with its own working days, times and time zone, and the traveller is told when
          <em> any</em> office will next be open. There is no screen to set them yet: they are stored on the company
          record by whoever runs your installation. Until they are set, no hours are shown and the acknowledgement simply
          says someone will reply.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>The traveller starts the conversation. You cannot open one and write first; use email or WhatsApp for that.</li>
          <li>Messages are text only. Files go through{' '}
            <Link href="/docs/passport-documents" className="text-primary-600 hover:underline">
              document attachments
            </Link> instead.</li>
          <li>Portal conversations cannot be assigned, archived or deleted, and they are left out of the Unified Inbox&apos;s Unassigned, Archived and Spam filters.</li>
          <li>A portal thread cannot be filtered by client: bookings carry the client&apos;s details but are not linked to a client record.</li>
          <li>Office hours cannot be edited in the app.</li>
        </ul>
      </section>
    </div>
  )
}
