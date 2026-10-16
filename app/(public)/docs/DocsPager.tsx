import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { adjacentDocs } from './toc'

/** Previous / next links at the foot of every docs page, from the table of
 *  contents. The docs layout renders it, so no page carries its own. */
export function DocsPager({ href }: { href: string }) {
  const adjacent = adjacentDocs(href)
  if (!adjacent) return null
  const { prev, next } = adjacent
  return (
    <nav aria-label="Docs pages" className="mt-12 pt-6 border-t border-gray-200 flex justify-between gap-4">
      {prev ? (
        <Link
          href={prev.href}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {prev.title}
        </Link>
      ) : <span />}
      {next && (
        <Link
          href={next.href}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors text-right"
        >
          Next: {next.title}
          <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </nav>
  )
}
