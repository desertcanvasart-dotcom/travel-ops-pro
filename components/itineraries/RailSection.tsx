'use client'

import type { ReactNode } from 'react'

/** A card in the itinerary page's right rail. */
export function RailSection({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="bg-white rounded-lg border border-gray-200 shadow-sm" data-testid={testId}>
      <h2 className="px-4 pt-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      <div className="px-4 pb-3">{children}</div>
    </section>
  )
}

/** A sub-heading inside a rail card ("For the client", "Internal"). */
export function RailGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-1 first:mt-0">
      <p className="text-[11px] font-medium text-gray-400 mb-1">{title}</p>
      <ul className="divide-y divide-gray-100">{children}</ul>
    </div>
  )
}

/** One document: its name on the left, what can be done with it on the right. */
export function DocRow({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-2 py-1.5">
      <div className="min-w-0">
        <p className="text-sm text-gray-800 truncate">{label}</p>
        {hint && <p className="text-[11px] text-gray-400 truncate">{hint}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0 text-xs">{children}</div>
    </li>
  )
}

/** The link style every rail action shares. */
export const RAIL_ACTION =
  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed'
