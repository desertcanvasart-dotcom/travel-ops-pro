import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function VocabularyPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Vocabulary</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Vocabulary</h1>
      <p className="text-gray-600 mb-8">
        The words the app shows you are yours to change. If your team says &ldquo;programme&rdquo;
        rather than &ldquo;tour&rdquo;, or &ldquo;client&rdquo; rather than &ldquo;traveller&rdquo;,
        relabel them once in <strong>Settings &rarr; Vocabulary</strong> and every screen follows.
        Nothing under the hood is renamed &mdash; only the label you read.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What you can relabel</h2>
        <p className="text-gray-600 mb-3">
          There are 35 built-in terms &mdash; the kinds of thing the app talks about: tours and
          packages, suppliers, guides, hotels, itineraries, quotes, and so on. Each has a default
          English label and a default Japanese label, and you can override either.
        </p>
        <p className="text-gray-600">
          You are changing the <em>label</em>, not the <em>thing</em>. A relabelled &ldquo;tour&rdquo;
          is still the same record, still priced the same way, still exported under the same key.
          That is why the change is safe to make at any time and safe to undo.
        </p>
        <ScreenshotPlaceholder caption="The Vocabulary editor, with the default and your override side by side" />
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">English and Japanese</h2>
        <p className="text-gray-600 mb-3">
          Every term carries both an English and a Japanese label. When a staff member views the
          app in Japanese they see your Japanese override; in English, your English one. Leave one
          side blank and the app falls back to its built-in default for that language, so you can
          relabel just the language you care about.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Where your words show up</h2>
        <p className="text-gray-600 mb-3">
          The labels reach across the product: the sidebar, page headings, buttons, and &mdash;
          importantly &mdash; the <Link href="/docs/tours-rates" className="text-primary-600 hover:underline">Rates Hub</Link>,
          where the category names you rate against read in your own vocabulary.
        </p>
        <Tip>
          Vocabulary is about wording, not translation of content. To copy and translate an actual
          itinerary or quote between English and Japanese, use{' '}
          <Link href="/docs/multi-language" className="text-primary-600 hover:underline">Languages</Link>.
        </Tip>
      </section>
    </div>
  )
}
