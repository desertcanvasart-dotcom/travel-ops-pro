import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function CopilotDocsPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">AI Copilot &amp; Knowledge Base</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">AI Copilot &amp; Knowledge Base</h1>
      <p className="text-gray-600 mb-8">
        The AI Copilot drafts replies that are grounded in <strong>your own knowledge base</strong> &mdash; not generic internet text. Incoming WhatsApp and email messages land in a shared Copilot inbox, where the assistant retrieves the most relevant facts you&apos;ve taught it and proposes a draft for you to review. Over time, an agent-memory feedback loop learns your operation&apos;s style and personalizes itinerary generation.
      </p>

      {/* The Copilot Inbox */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The Copilot Inbox</h2>
        <p className="text-gray-600 mb-3">
          Open <strong>Copilot</strong> from the sidebar to see a unified review queue. Inbound messages from WhatsApp and email are gathered into <strong>threads</strong>, and the panel shows:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Thread List</strong> &mdash; Every conversation with its latest message and status</li>
          <li><strong>Review Panel</strong> &mdash; The selected thread with the AI&apos;s suggested draft</li>
          <li><strong>Draft Status</strong> &mdash; Drafts are generated for pending messages and held for your approval</li>
        </ul>
        <Tip>
          <strong>You stay in control.</strong> The Copilot only ever proposes a draft. Nothing is sent until you review and approve it &mdash; the assistant never replies to a customer on its own.
        </Tip>
        <ScreenshotPlaceholder caption="Copilot inbox with thread list and the review panel showing a suggested draft" />
      </section>

      {/* How Grounded Drafting Works (RAG) */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">How Grounded Drafting Works</h2>
        <p className="text-gray-600 mb-3">
          When a draft is needed, the Copilot uses <strong>semantic retrieval</strong> (RAG): it converts the customer&apos;s message into a vector and pulls the top matching entries from your knowledge base by meaning, not just keywords. Those retrieved facts are injected into the prompt so the reply reflects <strong>your</strong> policies, tours, and answers.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Retrieval is <strong>scoped to your organization</strong> &mdash; only your knowledge is used</li>
          <li>Results are ranked by similarity, with low-confidence matches filtered out</li>
          <li>The draft cites what it drew on, so you can tell where an answer came from</li>
        </ul>
      </section>

      {/* Building Your Knowledge Base */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Building Your Knowledge Base</h2>
        <p className="text-gray-600 mb-3">
          Go to <strong>Copilot Knowledge</strong> to manage what the assistant knows. Each entry is embedded and made searchable. Entry types:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>FAQ</strong> &mdash; Question and answer pairs the Copilot should know</li>
          <li><strong>Policy</strong> &mdash; Cancellation, refunds, and terms &mdash; your authoritative rules</li>
          <li><strong>Tour</strong> &mdash; Tour descriptions, itineraries, and what&apos;s included</li>
          <li><strong>Other</strong> &mdash; Anything else the Copilot should draw on</li>
        </ul>
        <p className="text-gray-600 mt-3">
          You can add entries by hand, bulk-import them, and toggle any entry active or inactive. A <strong>tone</strong> setting (professional, friendly, or formal) shapes how drafts read.
        </p>
        <ScreenshotPlaceholder caption="Copilot Knowledge editor with FAQ, Policy, Tour, and Other entry types" />
      </section>

      {/* Learning From Your Best Replies */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Learning From Your Best Replies</h2>
        <p className="text-gray-600 mb-3">
          The Copilot also learns from how <em>you</em> answer. When you send an approved reply, the system can pair it with the customer&apos;s preceding question and store that pair as a knowledge entry &mdash; so your real answers become future exemplars. AI-generated drafts are deliberately excluded from this loop to keep the signal clean.
        </p>
      </section>

      {/* Agent Memory & Personalization */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Agent Memory &amp; Personalization</h2>
        <p className="text-gray-600 mb-3">
          A separate <strong>agent-memory</strong> layer observes patterns across your work and records durable notes &mdash; for example client preferences, pricing patterns, recurring inquiry types, and supplier notes. These memories are injected into <strong>itinerary generation</strong> so the AI gradually tailors its output to how your operation actually runs.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Memories carry a <strong>confidence</strong> level and an observation count that grow as a pattern repeats</li>
          <li>They are organization-scoped and processed by a background feedback loop</li>
          <li>Every itinerary generation reads the current memories and applies the relevant ones</li>
        </ul>
        <Tip>
          The more you use Autoura, the more its suggestions sound like you. Personalization improves quietly in the background &mdash; there&apos;s nothing extra to configure.
        </Tip>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/whatsapp-agent" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: WhatsApp AI Agent
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
