import { Suspense } from 'react'
import TourManagerContent from './TourManagerContent'

export const dynamic = 'force-dynamic'

export default function TourManagerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    }>
      <TourManagerContent />
    </Suspense>
  )
}