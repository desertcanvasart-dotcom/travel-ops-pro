import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScreenshotPlaceholder, DocScreenshot, Tip } from '../layout'

export default function ItineraryCreationPage() {
  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Itinerary Creation</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Itinerary Creation</h1>
      <p className="text-gray-600 mb-8">
        Autoura uses AI to automatically generate complete itineraries from WhatsApp conversations and emails. Paste a conversation, and the system extracts client details, trip requirements, and builds a full day-by-day itinerary with activities, meals, and services.
      </p>

      {/* Overview */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Overview</h2>
        <p className="text-gray-600 mb-3">
          The WhatsApp Parser is available from the sidebar under <strong>WhatsApp Parser</strong>. It supports two workflows:
        </p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>B2C Mode</strong> &mdash; Creates a standard itinerary for direct client pricing</li>
          <li><strong>B2B Mode</strong> &mdash; Creates a tour template and variation for the B2B pricing pipeline</li>
        </ul>
        <ScreenshotPlaceholder caption="WhatsApp Parser main screen with mode toggle (B2C / B2B)" />
      </section>

      {/* Step 1: Paste Conversation */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Step 1: Paste the Conversation</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Open the <strong>WhatsApp Parser</strong> page</li>
          <li>Select either <strong>B2C</strong> or <strong>B2B</strong> mode at the top</li>
          <li>Paste the WhatsApp conversation or email into the text area</li>
          <li>Click <strong>Analyze Conversation</strong></li>
        </ol>
        <p className="text-gray-600 mt-3">
          The AI (Claude) will analyze the text and extract all relevant information: client name, email, phone, nationality, trip dates, number of travelers, cities, hotel preferences, and special requests.
        </p>
        <ScreenshotPlaceholder caption="Paste area with conversation text and Analyze button" />
      </section>

      {/* Step 2: Review Extracted Data */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Step 2: Review Extracted Data</h2>
        <p className="text-gray-600 mb-3">
          After analysis, the system shows all extracted fields in an editable form:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
          <li><strong>Client Info</strong> &mdash; Name, email, phone, company (B2B), nationality</li>
          <li><strong>Trip Details</strong> &mdash; Trip name, start/end dates, duration, adults/children</li>
          <li><strong>Package Type</strong> &mdash; Full package, cruise & land, tours only, day trips, etc.</li>
          <li><strong>Day-by-Day Plan</strong> &mdash; Each day with city, activities, attractions, meals, and transport</li>
          <li><strong>Budget Level</strong> &mdash; Budget, standard, deluxe, or luxury</li>
        </ul>
        <p className="text-gray-600">
          You can edit any field before generating the itinerary. The AI includes a confidence score showing how certain it is about the extraction.
        </p>
        <Tip>
          <strong>Pro Tip:</strong> Always review the overnight city for each day. For day trips (e.g., Cairo to Alexandria and back), ensure the overnight city is the base city they return to, not the city they visited.
        </Tip>
        <DocScreenshot src="/docs/itinerary-creation/parser-review.jpg" alt="Pricing grid with trip settings, live quote calculation, and paste/upload input options" />
      </section>

      {/* Step 3: Generate Itinerary */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Step 3: Generate Itinerary</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-700">
          <li>Review all extracted data and make any corrections</li>
          <li>Click <strong>Generate Itinerary</strong></li>
          <li>The system creates a full itinerary with:
            <ul className="list-disc list-inside ml-6 mt-2 space-y-1 text-gray-600">
              <li>Day-by-day structure with titles and descriptions</li>
              <li>Services assigned to each day (guide, transport, meals, hotel, entrances)</li>
              <li>Attractions with entrance/photo stop classification</li>
              <li>Overnight city assignments for hotel pricing</li>
            </ul>
          </li>
        </ol>
        <ScreenshotPlaceholder caption="Itinerary generation progress and success screen" />
      </section>

      {/* B2C vs B2B */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">B2C vs B2B Mode</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">B2C Mode</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
              <li>Creates a standard itinerary</li>
              <li>Ready for B2C pricing calculation</li>
              <li>Client-facing PDF export</li>
              <li>Direct invoice generation</li>
            </ul>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">B2B Mode</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
              <li>Creates a tour template + variation</li>
              <li>Feeds into B2B price calculator</li>
              <li>Rate sheet generation (1-40 pax)</li>
              <li>B2B quote PDF with partner branding</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Supported Input Formats */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Supported Input Formats</h2>
        <p className="text-gray-600 mb-3">
          The AI parser understands multiple input formats:
        </p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li><strong>WhatsApp conversations</strong> &mdash; Copy-paste directly from WhatsApp</li>
          <li><strong>Emails</strong> &mdash; Paste the full email including headers (From, Subject, Date)</li>
          <li><strong>Tour operator shorthand</strong> &mdash; Abbreviations like &ldquo;3NTS CAI + 4NTS CRZ + 2NTS HRG&rdquo;</li>
          <li><strong>Structured day plans</strong> &mdash; &ldquo;D1 CAI/ALX/CAI&rdquo;, &ldquo;D2 CAI - Pyramids&rdquo;</li>
        </ul>
        <Tip>
          <strong>Abbreviations:</strong> The system automatically decodes common abbreviations &mdash; CAI (Cairo), ALX (Alexandria), ASW (Aswan), LXR (Luxor), HRG (Hurghada), CRZ (Cruise), etc.
        </Tip>
      </section>

      {/* Navigation */}
      <div className="mt-12 pt-6 border-t border-gray-200 flex justify-between">
        <Link href="/docs/clients" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ChevronRight className="w-4 h-4 rotate-180" />
          Clients (CRM)
        </Link>
        <Link href="/docs/itineraries" className="flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          Next: Itineraries
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
