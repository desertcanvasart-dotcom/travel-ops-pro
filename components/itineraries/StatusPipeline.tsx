'use client'

import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'

export interface PipelineInput {
  status: string
  hasBooking: boolean
  hasInvoice: boolean
  invoicePaid: boolean
}

export type PipelineStep = 'quote' | 'sent' | 'confirmed' | 'booked' | 'invoiced' | 'paid'

const STEPS: PipelineStep[] = ['quote', 'sent', 'confirmed', 'booked', 'invoiced', 'paid']

/**
 * Which steps of the trip's life are done. Each is read off its own record,
 * not inferred from the ones before it — so a trip invoiced before it was
 * booked shows exactly that, a gap in the line, instead of a tidy lie.
 */
export function pipelineSteps(input: PipelineInput): Record<PipelineStep, boolean> {
  const s = input.status
  const confirmed = s === 'confirmed' || s === 'completed'
  return {
    quote: true,
    sent: confirmed || s === 'sent',
    confirmed,
    booked: input.hasBooking,
    invoiced: input.hasInvoice,
    paid: input.invoicePaid,
  }
}

/** The trip's progress from quote to paid, one line under the title. */
export default function StatusPipeline(props: PipelineInput) {
  const t = useTranslations('itineraries.detail.layout')
  if (props.status === 'cancelled') {
    return (
      <span className="inline-flex px-2 py-0.5 rounded border border-red-200 bg-red-50 text-xs font-medium text-red-700">
        {t('cancelled')}
      </span>
    )
  }
  const done = pipelineSteps(props)
  const label: Record<PipelineStep, string> = {
    quote: t('stepQuote'),
    sent: t('stepSent'),
    confirmed: t('stepConfirmed'),
    booked: t('stepBooked'),
    invoiced: t('stepInvoiced'),
    paid: t('stepPaid'),
  }
  // The first step not done is where the trip is now.
  const current = STEPS.find(step => !done[step])
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs" data-testid="status-pipeline">
      {STEPS.map((step, i) => (
        <li key={step} className="flex items-center gap-1">
          {i > 0 && <span className={`h-px w-3 ${done[step] ? 'bg-green-400' : 'bg-gray-300'}`} aria-hidden />}
          <span
            data-done={done[step]}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
              done[step]
                ? 'border-green-200 bg-green-50 text-green-700'
                : step === current
                  ? 'border-primary-300 bg-white text-primary-700 font-medium'
                  : 'border-gray-200 bg-white text-gray-400'
            }`}
          >
            {done[step] && <Check className="w-3 h-3" aria-hidden />}
            {label[step]}
          </span>
        </li>
      ))}
    </ol>
  )
}
