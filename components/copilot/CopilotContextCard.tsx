'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, User, Route, FileText, CreditCard, MessageSquare } from 'lucide-react'
import type { CopilotContext } from '@/types/copilot'

interface CopilotContextCardProps {
  context: CopilotContext
}

function Section({ title, icon: Icon, children, defaultOpen = false }: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Icon className="w-3.5 h-3.5" />
        {title}
      </button>
      {isOpen && (
        <div className="px-3 pb-2 text-xs text-gray-700">
          {children}
        </div>
      )}
    </div>
  )
}

export default function CopilotContextCard({ context }: CopilotContextCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Context Used by AI</span>
      </div>

      {/* Client Info */}
      <Section title="Client" icon={User} defaultOpen={!!context.client}>
        {context.client ? (
          <div className="space-y-1">
            <div><span className="text-gray-500">Name:</span> {context.client.name}</div>
            {context.client.email && <div><span className="text-gray-500">Email:</span> {context.client.email}</div>}
            {context.client.phone && <div><span className="text-gray-500">Phone:</span> {context.client.phone}</div>}
            {context.client.nationality && <div><span className="text-gray-500">Nationality:</span> {context.client.nationality}</div>}
            {context.client.language && <div><span className="text-gray-500">Language:</span> {context.client.language}</div>}
            <div><span className="text-gray-500">Bookings:</span> {context.client.total_bookings}</div>
          </div>
        ) : (
          <div className="text-gray-400 italic">No matching client found</div>
        )}
      </Section>

      {/* Itineraries */}
      {context.itineraries.length > 0 && (
        <Section title={`Itineraries (${context.itineraries.length})`} icon={Route}>
          <div className="space-y-2">
            {context.itineraries.map((it) => (
              <div key={it.id} className="p-2 bg-gray-50 rounded">
                <div className="font-medium">{it.tour_name || 'Untitled'}</div>
                <div className="text-gray-500">
                  {it.reference && <span>{it.reference} · </span>}
                  {it.start_date && <span>{new Date(it.start_date).toLocaleDateString()} → </span>}
                  {it.end_date && <span>{new Date(it.end_date).toLocaleDateString()}</span>}
                </div>
                <div className="flex gap-2 mt-1">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    it.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                    it.status === 'draft' ? 'bg-gray-100 text-gray-600' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {it.status}
                  </span>
                  {it.pax && <span className="text-gray-500">{it.pax} pax</span>}
                  {it.quoted_amount && <span className="text-gray-500">{it.currency} {it.quoted_amount.toLocaleString()}</span>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Invoices */}
      {context.invoices.length > 0 && (
        <Section title={`Invoices (${context.invoices.length})`} icon={FileText}>
          <div className="space-y-1.5">
            {context.invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-1.5 bg-gray-50 rounded">
                <div>
                  <span className="font-medium">{inv.invoice_number}</span>
                  <span className="text-gray-400 ml-1">({inv.invoice_type})</span>
                </div>
                <div className="text-right">
                  <div>{inv.currency} {inv.total_amount?.toLocaleString()}</div>
                  {(inv.balance_due || 0) > 0 && (
                    <div className="text-red-600 text-[10px]">Due: {inv.currency} {inv.balance_due?.toLocaleString()}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Payments */}
      {context.payments.length > 0 && (
        <Section title={`Payments (${context.payments.length})`} icon={CreditCard}>
          <div className="space-y-1">
            {context.payments.map((p) => (
              <div key={p.id} className="flex justify-between text-[11px]">
                <span>{p.currency} {p.amount?.toLocaleString()} via {p.payment_method}</span>
                <span className="text-gray-500">{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : 'N/A'}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Recent Messages */}
      {context.recent_messages.length > 0 && (
        <Section title={`History (${context.recent_messages.length} msgs)`} icon={MessageSquare}>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {context.recent_messages.map((m, i) => (
              <div key={i} className={`p-1.5 rounded text-[11px] ${
                m.direction === 'inbound' ? 'bg-gray-100' : 'bg-green-50'
              }`}>
                <div className="font-medium text-[10px] text-gray-500 mb-0.5">
                  {m.direction === 'inbound' ? 'Customer' : 'Operator'} · {new Date(m.sent_at).toLocaleString()}
                </div>
                <div className="line-clamp-2">{m.body}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Empty state */}
      {!context.client && context.itineraries.length === 0 && context.invoices.length === 0 && (
        <div className="px-3 py-4 text-xs text-gray-400 text-center italic">
          No context data found for this sender
        </div>
      )}
    </div>
  )
}
