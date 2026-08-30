import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function CopilotAnalyticsPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Copilot Analytics</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Copilot Analytics</h1>
      <p className="text-gray-600 mb-8">
        <strong>Communications &rarr; Copilot Analytics</strong> measures how the <Link href="/docs/copilot" className="text-primary-600 hover:underline">AI Copilot</Link> is being used: conversations by channel, their statuses, and usage over time.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reading the Numbers</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>By channel</strong> &mdash; where Copilot work comes from (WhatsApp, email, portal)</li>
          <li><strong>By status</strong> &mdash; how conversations resolve; a pile-up in one status is a process signal</li>
          <li><strong>Over time</strong> &mdash; adoption and load, week by week</li>
        </ul>
        <Tip>Falling usage usually means weak answers, and weak answers usually mean gaps in <Link href="/docs/copilot-knowledge" className="text-primary-600 hover:underline">Copilot Knowledge</Link> &mdash; fix the knowledge, not the model.</Tip>
      </section>
    </div>
  )
}
