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
        <strong>Copilot Knowledge Base</strong> holds the facts the <Link href="/docs/copilot" className="text-primary-600 hover:underline">AI Copilot</Link> draws on when it drafts a reply: FAQs, policies, tour descriptions and anything else you add. For each customer message the Copilot looks up the entries closest in meaning and writes from them. It also holds your personal Copilot tone.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where It Is and Who Can Use It</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>In the menu under <strong>Communicate &rarr; Copilot Knowledge</strong> (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/copilot-knowledge</code>).</li>
          <li>The owner, <strong>Administrators</strong>, <strong>Managers</strong> and <strong>Agents</strong> can open it and add, edit, switch off or delete entries. Viewers can&apos;t open it.</li>
          <li>Entries belong to the company you are working in. Each company&apos;s Copilot only uses its own entries.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Copilot Tone</h2>
        <p className="text-gray-600 mb-3">
          The <strong>Your copilot tone</strong> card has three buttons: <strong>Professional</strong>, <strong>Friendly</strong> and <strong>Formal</strong>. The choice is yours alone: each teammate has their own, and drafts written on your screen use yours. If saving fails, the card goes back to the tone that is actually stored.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reading the List</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The filter row shows <strong>All</strong>, <strong>FAQ</strong>, <strong>Policy</strong>, <strong>Tour</strong> and <strong>Other</strong>, each with a count.</li>
          <li>Each card shows its type, its title, the question (for an FAQ) and the start of its text. A long entry shows how many chunks it was split into.</li>
          <li>A switched-off entry is greyed out and marked <strong>disabled</strong>. The Copilot does not use it.</li>
          <li>The list shows your 500 most recently changed entries.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding or Editing an Entry</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Add entry</strong>, or the pencil icon on a card.</li>
          <li>Pick the type (new entries only): <strong>FAQ</strong>, <strong>Policy</strong>, <strong>Tour</strong> or <strong>Other</strong>.</li>
          <li>Give it a title. For an FAQ, the <strong>question</strong> is required.</li>
          <li>Write or paste the content. When you edit, the whole text of the entry is in the box, however long it is.</li>
          <li>Save. The text is split into chunks of about 1,200 characters and each chunk is made searchable. Saving an edit replaces all the old chunks, the question and the chunk count.</li>
        </ol>
        <p className="text-gray-600 mt-3">
          The power icon (<strong>Disable</strong> / <strong>Enable</strong>) switches an entry off or on; the trash icon deletes it (with all its chunks). If the server refuses either, a red message says so and the list stays as it was.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Bulk Import</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Click <strong>Bulk import</strong> and paste at least 20 characters.</li>
          <li><strong>AI-structured</strong>: Claude splits the text into separate FAQ, policy, tour and other entries.</li>
          <li><strong>As a single entry</strong>: the whole paste becomes one entry of the type you choose, still split into chunks.</li>
          <li>The result says how many entries were imported and lists any that failed.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Writing Entries That Are Found</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>For each customer message the Copilot uses at most 6 entries (or chunks), the closest in meaning. One topic per entry works better than one long document.</li>
          <li>For an FAQ the question is what gets matched, so phrase it the way customers ask.</li>
          <li>Use concrete numbers, names and dates. That is what customers ask about.</li>
        </ul>
        <Tip><Link href="/docs/copilot-analytics" className="text-primary-600 hover:underline">Copilot Analytics</Link> shows the <strong>RAG hit rate</strong> (drafts that found at least one entry) and the <strong>Top-retrieved knowledge</strong>. A low hit rate means customers ask about things this page doesn&apos;t cover yet.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>It does not learn from your sent replies. Only the entries on this page are used.</li>
          <li>It does not import files. Paste text instead.</li>
          <li>Entries are not shared between companies.</li>
          <li>It does not show which entries a particular draft used.</li>
        </ul>
      </section>
    </div>
  )
}
