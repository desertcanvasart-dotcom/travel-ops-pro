import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import NewItineraryContent from './new-itinerary-content'

// useSearchParams() (this page reads ?clientId=) has to sit inside a Suspense
// boundary, or the build cannot prerender the page and fails at export time —
// which is what broke the deploy of #111. tsc cannot see this; only a real
// `next build` does. It is why so many pages here are a page.tsx wrapper over
// a *-content.tsx.
export default function NewItineraryPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    }>
      <NewItineraryContent />
    </Suspense>
  )
}
