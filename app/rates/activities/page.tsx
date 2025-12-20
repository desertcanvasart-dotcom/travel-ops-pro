import { Suspense } from 'react'
import ActivityRatesContent from './activity-rates-content'

export default function ActivityRatesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading activity rates...</p>
        </div>
      </div>
    }>
      <ActivityRatesContent />
    </Suspense>
  )
}