import { Suspense } from 'react'
import GuideRatesContent from './guide-rates-content'

export default function GuideRatesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading guide rates...</p>
        </div>
      </div>
    }>
      <GuideRatesContent />
    </Suspense>
  )
}