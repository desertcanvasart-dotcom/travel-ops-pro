import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, Tip } from '../layout'

export default function MultiLanguagePage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Multi-Language</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Multi-Language</h1>
      <p className="text-gray-600 mb-8">
        Autoura is fully bilingual in <strong>English</strong> and <strong>Japanese</strong>. The whole interface switches with one click, and any itinerary can carry a parallel Japanese version of its day-by-day content &mdash; so the same trip is ready to send to an English-speaking partner or a Japanese client without re-typing anything.
      </p>

      {/* Interface Language */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Interface Language</h2>
        <p className="text-gray-600 mb-3">
          Every label, button, and message in the app is translated. Switch between the two supported locales at any time:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>English (&#127468;&#127463;)</strong> &mdash; The default locale</li>
          <li><strong>&#26085;&#26412;&#35486; (&#127471;&#127477;)</strong> &mdash; Full Japanese translation of the interface</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Dates, times, and currency follow the locale too &mdash; English shows USD, Japanese shows JPY &mdash; so figures read naturally for each audience.
        </p>
        <ScreenshotPlaceholder caption="Language switcher toggling the interface between English and Japanese" />
      </section>

      {/* Itinerary Language Versions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Itinerary Language Versions</h2>
        <p className="text-gray-600 mb-3">
          Beyond the interface, each itinerary stores its content per language. Every day&rsquo;s title, description, city, and overnight city can exist in both English and Japanese, surfaced through a language tab on the itinerary.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>Auto-populated on generation</strong> &mdash; When you generate an itinerary, its language version is created immediately, so the tab is ready right away</li>
          <li><strong>Per-day content</strong> &mdash; Titles and descriptions are stored separately for each language</li>
          <li><strong>Edit independently</strong> &mdash; Refine the Japanese wording without touching the English original</li>
        </ul>
        <ScreenshotPlaceholder caption="Itinerary editor with English and Japanese language tabs" />
      </section>

      {/* One-Click Translation */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">One-Click Copy &amp; Translate</h2>
        <p className="text-gray-600 mb-3">
          You don&rsquo;t have to write both versions by hand. The system detects the language of the generated content and routes it to the right version &mdash; Japanese trips fill the Japanese tab, everything else fills the English tab.
        </p>
        <Tip>
          Translation happens day by day, preserving structure. The English itinerary and its Japanese counterpart stay aligned, so what your client reads matches what your partner sees.
        </Tip>
      </section>

      {/* Quotes & Documents */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quotes &amp; Documents</h2>
        <p className="text-gray-600 mb-3">
          Language carries through to what you send. Quote and itinerary PDFs render Japanese text with proper fonts, and client-facing emails can be sent in the recipient&rsquo;s language.
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>PDF export</strong> &mdash; Japanese-safe fonts so quotes render correctly for Japanese partners</li>
          <li><strong>Localized emails</strong> &mdash; Itinerary and payment-reminder emails available in English and Japanese</li>
        </ul>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          All Docs
        </Link>
        <Link href="/docs/integrations" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Integrations
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
