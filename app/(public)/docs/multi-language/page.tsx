import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'

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
        The app works in <strong>English</strong> and <strong>Japanese</strong>. There are two separate things: the
        language of the screens you work in, and the language of the content you send to customers and partners
        (itineraries, quotes, tours). Content can exist in both languages, and the app machine-translates between them
        on request.
      </p>

      {/* Interface Language */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Screen language</h2>
        <p className="text-gray-600 mb-3">
          Choose <strong>English</strong> or <strong>日本語</strong> with the language selector at the bottom of the
          sidebar, or in Settings. The page reloads in the new language. The choice is stored in this browser, so each
          person (and each browser) can work in their own language.
        </p>
        <p className="text-gray-600 mb-3">
          Changing the screen language does not change the currency. Amounts are always shown in the currency of the
          trip, quote or company, whichever language you read them in.
        </p>
        <Tip>
          Screen language decides <em>which language</em> the labels appear in.{' '}
          <Link href="/docs/vocabulary" className="text-primary-600 hover:underline">Vocabulary</Link>{' '}
          decides <em>what those labels say</em>.
        </Tip>
      </section>

      {/* Itinerary Language Versions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Itineraries in two languages</h2>
        <p className="text-gray-600 mb-3">
          An itinerary has a <strong>source language</strong>: the language its days are written in. The app reads it
          off the text. AI-generated itineraries are written in English, so for them the source is English. The other
          language is a translation, stored day by day next to the source. Services and prices are shared by every
          language: changing one changes all of them.
        </p>
        <p className="text-gray-600 mb-3">On the itinerary, each target language shows a status:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>missing</strong> &mdash; no text in that language yet</li>
          <li><strong>N/M days</strong> &mdash; only some days have text</li>
          <li><strong>machine · N unreviewed</strong> &mdash; machine-translated and nobody has checked it</li>
          <li><strong>N outdated</strong> &mdash; the source text changed after those days were translated</li>
          <li><strong>reviewed</strong> &mdash; every day was saved by a person</li>
        </ul>
        <p className="text-gray-600 mb-3">To fill a language:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700 mb-3">
          <li><strong>Translate missing and outdated days</strong> &mdash; the first time, this also translates the trip
            title, notes, pickup point, guide and vehicle notes, inclusions, exclusions and service names. After that it
            translates only the days that are missing or outdated, plus service lines added since. An outdated day is
            replaced even if someone had reviewed it before the source changed.</li>
          <li><strong>Translate this day</strong> &mdash; one day at a time.</li>
          <li><strong>Side by side</strong> &mdash; edit the translation next to the source. <strong>Save as reviewed</strong> or
            <strong> Mark reviewed</strong> records that a person checked it.</li>
        </ul>
        <p className="text-gray-600">
          If the client&apos;s preferred language has no text, or only unreviewed machine text, the itinerary lists it
          under <strong>Needs attention</strong>. Sending a version that is not the client&apos;s language asks you first.
        </p>
      </section>

      {/* Quotes & tours */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">B2B quotes and tours</h2>
        <p className="text-gray-600 mb-3">
          A B2B quote and a tour have language tabs. On a tab with no text yet you can choose
          <strong> Create from scratch</strong> (an empty version you write yourself) or <strong>Copy &amp; Translate</strong>.
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>For a quote, Copy &amp; Translate translates the title, notes, terms and special requests. If the other
            language has no version yet, it translates the quote&apos;s notes and reads their language off the text; if the
            notes are already in the language you asked for, it says so instead of translating.</li>
          <li>For a tour, it translates the other language&apos;s version.</li>
          <li>If a translation fails, a message tells you why and nothing is created.</li>
        </ul>
      </section>

      {/* Engine & limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Who can translate, and how</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Translation is done by an OpenAI model on the app&apos;s own OpenAI account. Every translation is a paid model call; if no OpenAI key is configured, translating fails with a message saying so.</li>
          <li>Only staff (owner, admin, manager, agent) can translate. Viewers cannot.</li>
          <li>One request translates at most 200 pieces of text and 50,000 characters.</li>
          <li>The WhatsApp and unified inbox use the same translation to read incoming messages and translate replies.</li>
        </ul>
      </section>

      {/* Limits */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">What it does not do</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li>Only English and Japanese. No other content or screen language.</li>
          <li>It does not generate an itinerary directly in Japanese; generate, then translate.</li>
          <li>Copy &amp; Translate makes a language once. If that language already exists, it refuses; use
            <strong> Translate missing and outdated days</strong> on itineraries, or edit the text, instead.</li>
          <li>It does not translate message templates. Keep separate EN and JA templates.</li>
          <li>Machine translation is not checked by the app. Read it, then mark it reviewed.</li>
        </ul>
      </section>
    </div>
  )
}
