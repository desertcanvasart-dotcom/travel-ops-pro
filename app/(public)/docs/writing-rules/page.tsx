import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

export default function WritingRulesPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Writing Rules</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Writing Rules</h1>
      <p className="text-gray-600 mb-8">
        <strong>Communicate &rarr; Writing Rules</strong> is a list of style rules for AI-written content: words to use or avoid, tone, structure and formatting. Each rule has a type, a priority and optional good and bad examples. Some of these rules are added to the prompt when the AI writes day descriptions for a generated itinerary.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where It Is and Who Can Use It</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>In the menu under <strong>Communicate &rarr; Writing Rules</strong> (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/content-library/rules</code>). The <Link href="/docs/content-library" className="text-primary-600 hover:underline">Content Library</Link> page also has a <strong>Writing Rules</strong> button, and the back arrow on this page returns to the Content Library.</li>
          <li>The menu shows it to the owner, <strong>Administrators</strong> and <strong>Managers</strong>. Agents and Viewers don&apos;t see it in the menu. See <Link href="/docs/user-management" className="text-primary-600 hover:underline">User Management</Link> for roles.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reading the List</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The header shows the count, e.g. &ldquo;12 rules defining content style&rdquo;.</li>
          <li>The filter row has <strong>All Rules</strong> plus one button per category (<strong>Tone</strong>, <strong>Vocabulary</strong>, <strong>Structure</strong>, <strong>Formatting</strong>, <strong>Brand</strong>), each with a count.</li>
          <li>Rules are grouped under <strong>Enforce</strong>, <strong>Prefer</strong> and <strong>Avoid</strong>, highest priority first. A group with no rules is hidden.</li>
          <li>Click a rule to expand it. You see the full description, the bad examples (under <strong>Avoid</strong>), the good examples (under <strong>Better</strong>) and the <strong>Applies to</strong> channels.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding or Editing a Rule</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Add Rule</strong>, or the pencil icon on a rule to open <strong>Edit Rule</strong>.</li>
          <li>Enter a <strong>Rule Name</strong>, e.g. &ldquo;Avoid generic superlatives&rdquo;. You must fill in this field.</li>
          <li>Pick a <strong>Category</strong> (new rules start on Vocabulary) and a <strong>Rule Type</strong>: <strong>Enforce</strong>, <strong>Prefer</strong> or <strong>Avoid</strong> (new rules start on Enforce).</li>
          <li>Write the <strong>Description</strong>. You must fill in this field too. It is the rule itself, in plain language.</li>
          <li>Set <strong>Priority</strong> with the slider, from 1 (Low) to 10 (High). The default is 5.</li>
          <li>Choose <strong>Applies to</strong>: <strong>All</strong>, or any mix of <strong>Itinerary</strong>, <strong>Email</strong> and <strong>WhatsApp</strong>. If you pick All, the others are cleared.</li>
          <li>Optionally add <strong>Bad Examples</strong> and <strong>Good Examples</strong>, using <strong>+ Add Example</strong> for more lines. Empty lines are dropped when you save.</li>
          <li>Click <strong>Save Rule</strong>.</li>
        </ol>
        <p className="text-gray-600 mt-3">
          To delete a rule, click its trash icon and confirm <strong>Delete rule?</strong>. Deletion is permanent.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where the Rules Are Used</h2>
        <p className="text-gray-600 mb-3">
          Today, rules are read in one place only. That place is AI itinerary generation for land tours and cruise-plus-land trips, started from the WhatsApp parser (see <Link href="/docs/communication" className="text-primary-600 hover:underline">Unified Inbox</Link>). Both creative and structured generation use them.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The generator loads the active rules, sorted by priority.</li>
          <li>It takes the top 5 <strong>Enforce</strong> rules as &ldquo;must follow&rdquo; and the top 5 <strong>Avoid</strong> rules as &ldquo;avoid&rdquo;. These go into the day-description part of the prompt.</li>
          <li>It uses these rules alongside the curated descriptions from the <Link href="/docs/content-library" className="text-primary-600 hover:underline">Content Library</Link>. Curated descriptions give the AI the facts. Rules guide the wording.</li>
        </ul>
        <Tip>Only the five highest-priority Enforce rules and five highest-priority Avoid rules are picked. If you have more than that, raise the priority of the ones that matter most.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Known issue: your rule text does not reach the AI.</strong> The generator picks the rules but doesn&apos;t pass on their name, description or examples. Until this is fixed, rules have no real effect on generated text.</li>
          <li><strong>Prefer</strong> rules are never sent to the AI. Only Enforce and Avoid rules are selected.</li>
          <li>Examples are stored and shown on this page, but they are not used in generation.</li>
          <li><strong>Applies to</strong> is saved but ignored. Email replies, WhatsApp messages, <Link href="/docs/message-templates" className="text-primary-600 hover:underline">Message Templates</Link> and the <Link href="/docs/copilot" className="text-primary-600 hover:underline">Copilot</Link> don&apos;t read writing rules.</li>
          <li>No rule rewrites or checks text automatically. Rules are guidance for the AI only. They don&apos;t edit text you type yourself.</li>
          <li>You can&apos;t switch a rule off on this screen. You can only edit or delete it, and inactive rules don&apos;t appear in the list.</li>
          <li>Rules don&apos;t change the app&apos;s own labels. To rename words like &ldquo;tour&rdquo; or &ldquo;client&rdquo; on screen, use <Link href="/docs/vocabulary" className="text-primary-600 hover:underline">Vocabulary</Link>.</li>
        </ul>
      </section>
    </div>
  )
}
