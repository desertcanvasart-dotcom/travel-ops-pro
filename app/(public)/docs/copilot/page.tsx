import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function CopilotDocsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">AI Copilot</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">AI Copilot</h1>
      <p className="text-gray-600 mb-8">
        The AI Copilot drafts replies to customer WhatsApp messages and emails. You review each draft, edit it if you like, approve it and send it. Nothing is ever sent without a person pressing <strong>Send</strong>. Each draft is written from the customer&apos;s message, what the app knows about the customer, and the entries in your <Link href="/docs/copilot-knowledge" className="text-primary-600 hover:underline">Copilot Knowledge</Link>.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where It Is and Who Can Use It</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>In the menu under <strong>Communicate &rarr; AI Copilot</strong> (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/copilot</code>).</li>
          <li>The owner, <strong>Administrators</strong>, <strong>Managers</strong> and <strong>Agents</strong> can open it. Viewers can&apos;t, in the menu or by typing the address. See <Link href="/docs/user-management" className="text-primary-600 hover:underline">User Management</Link> for roles.</li>
          <li>Everything on the screen belongs to the company you are working in (the workspace switcher). Threads, drafts and knowledge of another company never appear.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How Messages Get Here</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Every inbound WhatsApp message (to your company&apos;s WhatsApp number) and every inbound email picked up by your company&apos;s mailbox sync is added to a <strong>thread</strong> for that conversation, with a new inbox entry waiting for a draft.</li>
          <li>Briefs from the AI Concierge also become threads (see <Link href="/docs/concierge" className="text-primary-600 hover:underline">Concierge Briefs</Link>). These are not drafted automatically: you press <strong>Generate draft reply</strong> when you are ready.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Thread List</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Each row shows the customer&apos;s name (or phone/email), how long ago the last message arrived, a snippet of the latest message, the channel icon and an urgency dot.</li>
          <li>The badge shows the latest message&apos;s state: <strong>New</strong>, <strong>Generating...</strong>, <strong>Draft Ready</strong>, <strong>Draft Failed</strong>, <strong>Sent</strong> or <strong>Skipped</strong>.</li>
          <li>Use <strong>Search conversations...</strong>, the channel filter (<strong>All channels</strong>, WhatsApp, Email) and the status filter (<strong>All status</strong>, Open, Waiting, Resolved, Archived) to narrow it.</li>
          <li>The list refreshes itself every 10 seconds.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">When Drafts Are Written</h2>
        <p className="text-gray-600 mb-3">
          Drafts are written on the server, whether or not anyone has the Copilot screen open. Every minute it drafts the messages still waiting, oldest first, up to 5 at a time, so a busy moment is worked through over the next few minutes. Every thread of every company is covered, not only the most recent ones. A message that already has a draft is not drafted twice.
        </p>
        <Tip>
          Messages that arrived more than 48 hours before they could be drafted are left as they are, so the first run never drafts an old backlog. Press <strong>Generate draft reply</strong> on one of them if you need it.
        </Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What the AI Uses for a Draft</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>The customer&apos;s message</strong> and the last 10 messages of the conversation.</li>
          <li><strong>The customer</strong>, when the thread is linked to a client: name, email, phone, nationality, language, internal notes and number of bookings; their 3 most recent itineraries (trip name, dates, status, travellers, price); their 5 most recent invoices; and their 10 most recent recorded payments.</li>
          <li><strong>Your knowledge</strong>: the 6 Copilot Knowledge entries closest in meaning to the message (weak matches are dropped). Only active entries of your company are searched.</li>
          <li><strong>Your tone</strong>: the tone you picked on the Copilot Knowledge page (Professional, Friendly or Formal). Drafts written automatically for new messages are always Professional, because no one is signed in when they are written. <strong>Regenerate</strong> and <strong>Generate draft reply</strong> use the tone of the person who presses them, never a colleague&apos;s. Without a choice, that is Professional too.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Open <strong>Context Used by AI</strong> under a draft to see the client, itineraries, invoices, payments and history it was given.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reviewing a Draft</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click a thread. The panel shows the <strong>Customer Message</strong>, the <strong>AI Draft</strong> with a confidence label (high, medium or low), and any <strong>AI Notes for Operator</strong>. A red <strong>AI Recommends Escalation</strong> banner appears when the AI thinks a senior person should answer.</li>
          <li>Click <strong>Edit</strong> to change the text.</li>
          <li><strong>Regenerate</strong> asks for a new draft. You can type extra instructions first, then press <strong>Go</strong>.</li>
          <li><strong>Reject</strong> discards the draft. <strong>Approve</strong> accepts it (with your edits). Only an approved draft can be sent.</li>
          <li><strong>Send</strong> sends it on the thread&apos;s channel: WhatsApp from your company&apos;s number, email from the mailbox the conversation came in on (or your company&apos;s connected Gmail).</li>
        </ol>
        <p className="text-gray-600 mt-3">
          WhatsApp only lets you reply within 24 hours of the customer&apos;s last message. The panel counts down the time left; after that, <strong>Send</strong> shows <strong>Window Expired</strong> and the customer must write again first.
        </p>
        <p className="text-gray-600 mt-3">
          If a draft fails, the panel shows <strong>Draft generation failed</strong> with the reason and a <strong>Retry</strong> button.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Agent Memory (Itinerary Generation)</h2>
        <p className="text-gray-600 mb-3">
          Agent memory is separate from the Copilot. A nightly job looks at itineraries the AI generated and records short notes about patterns, such as a client&apos;s usual tier, a language your enquiries often need, or a hotel you prefer. When the AI generates a new itinerary in creative mode, it is given up to 20 of your company&apos;s notes: the client&apos;s own notes first when the client is known, plus the company-wide notes.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>It never sends anything on its own. Every reply needs <strong>Approve</strong> and then <strong>Send</strong>.</li>
          <li>It does not answer questions you type to it. It only drafts replies to customer messages.</li>
          <li>It does not learn from the replies you send. Sent replies are not added to Copilot Knowledge; only entries you add yourself are used.</li>
          <li>The draft does not list which knowledge entries it used.</li>
          <li>Agent memory is not used for Copilot drafts.</li>
        </ul>
      </section>
    </div>
  )
}
