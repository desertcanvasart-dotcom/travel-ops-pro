import { Suspense } from 'react'
import WhatsappParserContent from './whatsapp-parser-content'

export default function WhatsappParserPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>}>
      <WhatsappParserContent />
    </Suspense>
  )
}
