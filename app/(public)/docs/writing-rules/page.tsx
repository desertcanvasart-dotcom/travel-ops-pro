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
        <strong>Communicate &rarr; Writing Rules</strong> is your company&apos;s list of style rules for AI-written itinerary text: words to use or avoid, tone, structure and formatting. Each rule has a type, a priority, the channels it applies to and optional good and bad examples. The most important active rules are given to the AI when it writes the day descriptions of a generated itinerary.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where It Is and Who Can Use It</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>In the menu under <strong>Communicate &rarr; Writing Rules</strong> (<code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">/content-library/rules</code>). The <Link href="/docs/content-library" className="text-primary-600 hover:underline">Content Library</Link> page also has a <strong>Writing Rules</strong> button, and the back arrow here returns to it.</li>
          <li>The owner, <strong>Administrators</strong> and <strong>Managers</strong> can open it and change rules. Agents and Viewers can&apos;t, in the menu or by typing the address. See <Link href="/docs/user-management" className="text-primary-600 hover:underline">User Management</Link> for roles.</li>
          <li>Rules belong to the company you are working in. Each company&apos;s AI uses only its own rules.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Reading the List</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>The header shows the count of all rules, active and inactive, e.g. &ldquo;12 rules defining content style&rdquo;.</li>
          <li>The filter row has <strong>All Rules</strong> plus one button per category (<strong>Tone</strong>, <strong>Vocabulary</strong>, <strong>Structure</strong>, <strong>Formatting</strong>, <strong>Brand</strong>), each with a count.</li>
          <li>Rules are grouped under <strong>Enforce</strong>, <strong>Prefer</strong> and <strong>Avoid</strong>, highest priority first. A group with no rules is hidden.</li>
          <li>An inactive rule is greyed out and marked <strong>Inactive</strong>.</li>
          <li>Click a rule to expand it: the full description, the bad examples (under <strong>Avoid</strong>), the good examples (under <strong>Better</strong>) and the <strong>Applies to</strong> channels.</li>
          <li>With no rules yet, the page says &ldquo;No writing rules yet&rdquo; and offers <strong>Add Rule</strong>.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Adding or Editing a Rule</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Click <strong>Add Rule</strong>, or the pencil icon on a rule to open <strong>Edit Rule</strong>.</li>
          <li>Enter a <strong>Rule Name</strong>, e.g. &ldquo;Avoid generic superlatives&rdquo;. It is required.</li>
          <li>Pick a <strong>Category</strong> (new rules start on Vocabulary) and a <strong>Rule Type</strong>: <strong>Enforce</strong>, <strong>Prefer</strong> or <strong>Avoid</strong> (new rules start on Enforce).</li>
          <li>Write the <strong>Description</strong>. It is required, and it is the rule itself in plain language: the AI reads it word for word.</li>
          <li>Set <strong>Priority</strong> with the slider, from 1 (Low) to 10 (High). The default is 5.</li>
          <li>Choose <strong>Applies to</strong>: <strong>All</strong>, or any mix of <strong>Itinerary</strong>, <strong>Email</strong> and <strong>WhatsApp</strong>. Picking All clears the others. A rule saved with nothing picked is stored as All.</li>
          <li>Optionally add <strong>Bad Examples</strong> and <strong>Good Examples</strong>, using <strong>+ Add Example</strong> for more lines. Empty lines are dropped when you save.</li>
          <li>Click <strong>Save Rule</strong>.</li>
        </ol>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mt-3">
          <li>Untick <strong>Active</strong> on a rule to switch it off without deleting it. Tick it again to switch it back on.</li>
          <li>To delete a rule, click its trash icon and confirm <strong>Delete rule?</strong>. Deletion is permanent.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What the AI Is Given</h2>
        <p className="text-gray-600 mb-3">
          Rules are used by AI itinerary generation, started from the WhatsApp parser, in both creative and structured mode. When an itinerary is generated, the AI is given a &ldquo;Writing style&rdquo; block built like this:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Only <strong>active</strong> rules whose <strong>Applies to</strong> includes <strong>Itinerary</strong> or <strong>All</strong>. Rules only for Email or WhatsApp are left out.</li>
          <li><strong>Must follow</strong>: the 5 highest-priority Enforce rules.</li>
          <li><strong>Avoid</strong>: the 5 highest-priority Avoid rules.</li>
          <li><strong>Prefer where it fits</strong>: the 3 highest-priority Prefer rules, after the other two.</li>
          <li>Each rule is written as &ldquo;Name: Description&rdquo;. Under it comes one example line with the rule&apos;s first good example and first bad example (each cut to 160 characters), when it has them. Further examples are not sent.</li>
        </ol>
        <Tip>Only 5 Enforce, 5 Avoid and 3 Prefer rules are sent. If you have more, raise the priority of the ones that matter most, or switch the rest off.</Tip>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What It Does Not Do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Email replies, WhatsApp messages, <Link href="/docs/message-templates" className="text-primary-600 hover:underline">Message Templates</Link> and the <Link href="/docs/copilot" className="text-primary-600 hover:underline">AI Copilot</Link> don&apos;t read writing rules. The Email and WhatsApp choices in <strong>Applies to</strong> only keep a rule out of itinerary generation.</li>
          <li>When a cruise trip uses a ready-made cruise programme from the Content Library, no rules are applied.</li>
          <li>No rule rewrites or checks text. Rules are guidance for the AI; they don&apos;t edit text you type yourself.</li>
          <li>Rules don&apos;t change the app&apos;s own labels. To rename words like &ldquo;tour&rdquo; or &ldquo;client&rdquo; on screen, use <Link href="/docs/vocabulary" className="text-primary-600 hover:underline">Vocabulary</Link>.</li>
        </ul>
      </section>
    </div>
  )
}
