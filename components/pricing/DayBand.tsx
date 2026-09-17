'use client'

// ============================================
// Where one day's price lines start and end
// ============================================
// Operator, 2026-09-17: the breakdown listed every line with the same thin
// rule, so "nothing like a line between each day" — where a day started and
// ended had to be read from the text. Each day now opens with a band — a
// heavy green rule, a round day badge, the day's name and its total — and its
// lines carry a light left edge, with space before the next day. The same
// band on the calculator's Cost Breakdown, a saved quote and a tour's price
// breakdown.

import { Fragment, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

/** The first cell of a line row inside a day band. */
export const DAY_LINE_EDGE = 'border-l-4 border-[#b8c9a8]'

type BandProps = {
  /** -1 = whole-trip lines with no day. */
  day: number
  label: ReactNode
  /** e.g. "9 services" */
  meta?: ReactNode
  /** e.g. a "2 without a rate" chip */
  badge?: ReactNode
  total: ReactNode
  /** Danger styling on the total when the day has lines with no rate. */
  hasGaps?: boolean
  /** Leaves out the space above the first day. */
  first?: boolean
  expanded?: boolean
  onToggle?: () => void
}

/** A table day band: a spacer row (except before the first day) and the band
 *  row. `columns` is the table's column count; the total sits in the last. */
export function DayBandRow({ columns, day, label, meta, badge, total, hasGaps, first, expanded, onToggle }: BandProps & { columns: number }) {
  return (
    <Fragment>
      {!first && (
        <tr aria-hidden="true">
          <td colSpan={columns} className="h-3 p-0 border-0" />
        </tr>
      )}
      <tr
        data-testid="day-band"
        className={`border-t-4 border-[#647C47] bg-[#647C47]/10 ${onToggle ? 'cursor-pointer hover:bg-[#647C47]/15' : ''} transition-colors`}
        onClick={onToggle}
      >
        <td colSpan={columns - 1} className="px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            {onToggle && (expanded
              ? <ChevronUp className="w-4 h-4 text-[#4a5c35]" />
              : <ChevronDown className="w-4 h-4 text-[#4a5c35]" />)}
            <DayBadge day={day} />
            <span className="font-semibold text-gray-900">{label}</span>
            {meta && <span className="text-xs text-gray-500 font-normal">{meta}</span>}
            {badge}
          </div>
        </td>
        <td className={`px-4 py-2.5 text-right font-bold ${hasGaps ? 'text-red-700' : 'text-gray-900'}`}>{total}</td>
      </tr>
    </Fragment>
  )
}

/** The same band for a list that is not a table. */
export function DayBandBlock({ day, label, meta, badge, total, hasGaps, first, children }: BandProps & { children: ReactNode }) {
  return (
    <div className={first ? '' : 'mt-3'} data-testid="day-band">
      <div className="flex items-center justify-between gap-2 border-t-4 border-[#647C47] bg-[#647C47]/10 px-3 py-2 rounded-b">
        <div className="flex items-center gap-2 min-w-0">
          <DayBadge day={day} />
          <span className="font-semibold text-gray-900 text-sm truncate">{label}</span>
          {meta && <span className="text-xs text-gray-500">{meta}</span>}
          {badge}
        </div>
        <span className={`text-sm font-bold shrink-0 ${hasGaps ? 'text-red-700' : 'text-gray-900'}`}>{total}</span>
      </div>
      <div className={`${DAY_LINE_EDGE} ml-2 pl-3 py-1.5 space-y-1.5`}>{children}</div>
    </div>
  )
}

function DayBadge({ day }: { day: number }) {
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#647C47] text-white text-xs font-bold shrink-0">
      {day > 0 ? day : '∑'}
    </span>
  )
}
