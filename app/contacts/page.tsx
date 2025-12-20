import { Suspense } from 'react'
import ContactsContent from './contacts-content'
import { Loader2 } from 'lucide-react'

export default function ContactsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    }>
      <ContactsContent />
    </Suspense>
  )
}
