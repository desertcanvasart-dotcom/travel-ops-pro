import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function CopilotKnowledgePage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Copilot Knowledge</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Copilot Knowledge</h1>
      <p className="text-gray-600 mb-8">
        <strong>Communications &rarr; Copilot Knowledge</strong> manages the knowledge base that grounds the <Link href="/docs/copilot" className="text-primary-600 hover:underline">AI Copilot</Link>. Every Copilot answer retrieves from these sources first (RAG) &mdash; the Copilot knows what you put here, and says so when it doesn&apos;t.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Managing Sources</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Add</strong> a knowledge entry &mdash; a policy, a supplier fact, an FAQ answer, a destination note &mdash; with a clear title</li>
          <li><strong>Edit</strong> when reality changes; the Copilot uses the current text immediately</li>
          <li><strong>Organise</strong> by topic so coverage gaps are visible at a glance</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Writing Entries That Retrieve Well</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>One fact per entry beats one giant document &mdash; retrieval picks entries, not paragraphs</li>
          <li>Write the question into the title (&ldquo;What is the cancellation policy for cruises?&rdquo;)</li>
          <li>Prefer concrete numbers and names over generalities &mdash; that is what customers ask about</li>
        </ul>
        <Tip>Check <Link href="/docs/copilot-analytics" className="text-primary-600 hover:underline">Copilot Analytics</Link> for questions the Copilot handled poorly &mdash; each one is a missing or weak knowledge entry.</Tip>
      </section>
    </div>
  )
}
