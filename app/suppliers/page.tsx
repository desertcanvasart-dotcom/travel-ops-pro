import { Suspense } from 'react'
import SuppliersContent from './suppliers-content'
import { Loader2 } from 'lucide-react'

export default function SuppliersPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    }>
      <SuppliersContent />
    </Suspense>
  )
}
