import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function GuestSurveysPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Guest Surveys</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Guest Surveys</h1>
      <p className="text-gray-600 mb-8">
        <strong>Operate &rarr; Guest Surveys</strong> is where you read the satisfaction questionnaires your guests fill in after a trip. Each itinerary gets one survey with its own private link. The link goes out automatically when the trip ends, the guest answers on their phone without logging in, and the answers show up here.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who Can Use It</h2>
        <p className="text-gray-700">
          The menu shows Guest Surveys to the owner, <strong>Administrators</strong> and <strong>Managers</strong>. Agents and Viewers do not see it in the menu.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How a Survey Gets Created and Sent</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Once a day a scheduled job looks at every itinerary whose end date is today. Draft and cancelled itineraries are skipped.</li>
          <li>It creates the itinerary&apos;s survey if none exists yet. The survey records the trip name, tour code, dates and client name as they were at that moment.</li>
          <li>It sends a Japanese invitation containing the <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/survey/&hellip;</code> link to the client&apos;s email and to their phone on WhatsApp, using the details saved on the itinerary. The message is signed with your organization&apos;s name from Settings.</li>
          <li>If at least one channel worked, the survey becomes <strong>Sent</strong>. If nothing went out (no email or phone on file, or both sends failed), it stays <strong>Pending</strong> and the job tries again on the next two days.</li>
          <li>When the guest submits the form, the survey becomes <strong>Submitted</strong>.</li>
        </ol>
        <p className="text-gray-700 mt-4">
          A survey that is already Sent or Submitted is never sent again, so a guest receives at most one invitation.
        </p>
        <Tip>Check that the client email and phone are filled in on the itinerary before the trip ends. Without them the invitation cannot go out, and after three days the job stops trying.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Printed Questionnaire</h2>
        <p className="text-gray-700 mb-3">
          If your organization has the printed questionnaire enabled, an itinerary&apos;s <strong>Documents</strong> menu includes <strong>Guest survey</strong>. It downloads a PDF of the paper questionnaire with a QR code that opens the same online survey for that itinerary.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Printing the sheet creates the survey early if it doesn&apos;t exist yet, and it stays <strong>Pending</strong>. The end-of-trip invitation still goes out as usual.</li>
          <li>If the guest scans the QR code and submits during the trip, the survey is already Submitted when the trip ends, so no invitation is sent.</li>
        </ul>
        <p className="text-gray-700 mt-3">
          See <Link href="/docs/itineraries" className="text-primary-600 hover:underline">Itineraries</Link> for the itinerary page and its menus.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What the Guest Sees</h2>
        <p className="text-gray-700 mb-3">
          The link opens a mobile page in Japanese titled <strong>アンケートのお願い</strong> (Guest Questionnaire). The guest doesn&apos;t need to log in.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The trip details are shown at the top, along with a name box that is pre-filled with the client name. The guest can clear it to answer anonymously.</li>
          <li>Ten service items (pre-departure information, airport arrival, vehicle, driver, tour guide, hotel room, hotel staff, dining, group assistant, shopping stops) and three overall items (overall satisfaction, likelihood to recommend, repeat travel intent). Each one is rated 5 to 1 or <strong>該当なし</strong> (N/A), with an optional comment.</li>
          <li>The guide item also asks for the guide&apos;s name, and the hotel room item asks for the hotel name.</li>
          <li>A yes/no question about optional excursions (with the city and tour name if yes), and a free-text box.</li>
          <li>No question is required. After <strong>送信する</strong> (Submit) the guest sees a thank-you message. Opening the link again shows the same thank-you message.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reading Results</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open <strong>Operate &rarr; Guest Surveys</strong>. Surveys are listed newest first, showing up to 300.</li>
          <li>Each row shows the trip name, a status badge (<strong>Pending</strong>, <strong>Sent</strong> or <strong>Submitted</strong>), the client name, the trip end date, which channels the invitation went out on (email, WhatsApp) and the submission date. Submitted rows also show the overall satisfaction score (<strong>総合</strong>) out of 5.</li>
          <li>Click a row to expand it. For a submitted survey you see every rating with the guest&apos;s comments, the guide and hotel names they entered, their optional-excursions answer and their free-text comments.</li>
          <li>For a survey that hasn&apos;t been submitted yet, the expanded row shows its link path (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/survey/&hellip;</code>). You can share that link with the guest yourself.</li>
        </ol>
        <Tip>The question labels and rating words in the expanded results appear in Japanese, the same text the guest saw. The section headings are in English.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Related Pages</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><Link href="/docs/itineraries" className="text-primary-600 hover:underline">Itineraries</Link>: the end date, status and client contact details that decide when and where the invitation goes</li>
          <li><Link href="/docs/communication" className="text-primary-600 hover:underline">Unified Inbox</Link>: where guest email and WhatsApp conversations are handled</li>
          <li><Link href="/docs/resources-documents" className="text-primary-600 hover:underline">Documents</Link>: other printable documents for a booking</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The screen is read-only. You can&apos;t create, resend, edit or delete a survey from it, and there is no button to send an invitation manually.</li>
          <li>There are no averages, charts, filters, search or export. Only the overall score is shown in the list.</li>
          <li>The questionnaire is fixed. You can&apos;t add or change questions, and both the form and the invitation are in Japanese only.</li>
          <li>The invitation wording is built in. You can&apos;t edit it from Message Templates.</li>
          <li>Each itinerary has one survey and one link. Several travellers on the same booking share that link.</li>
          <li>No invitation is sent once three days have passed after the end date, or for an itinerary that has no client email or phone.</li>
        </ul>
      </section>
    </div>
  )
}
