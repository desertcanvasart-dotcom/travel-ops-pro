'use client'

// ============================================
// ⌘K / Ctrl+K — search every page and jump to it
// ============================================
// Lists every sidebar item, every rate sheet, every Settings page and the
// pages only reached from a button (lib/nav/config.ts JUMP_ONLY_PAGES), each
// filtered by the viewer's role exactly as the menus are. Matches on the
// label, the group it sits in, and the item's keywords (old names and
// synonyms). The list is the config's; nothing here names a page.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search } from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import { navEntries, type NavEntry } from '@/lib/nav/config'

interface Row {
  href: string
  label: string
  hint: string
  haystack: string
  icon: NavEntry['item']['icon']
}

export default function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const t = useTranslations('navigation')
  const tTop = useTranslations('topBar')
  const { canAccess } = useRole()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // ⌘K on a Mac, Ctrl+K elsewhere; both work everywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const rows: Row[] = useMemo(() => {
    const seen = new Set<string>()
    const out: Row[] = []
    for (const e of navEntries()) {
      if (e.roles && !canAccess(e.roles)) continue
      if (seen.has(e.item.href)) continue
      seen.add(e.item.href)
      const label = t(e.item.labelKey)
      const hint = e.source === 'settings'
        ? `${t('settings')} › ${t(e.groupKey)}`
        : e.source === 'jump'
          ? tTop('jumpHint', { where: t(e.groupKey) })
          : t(e.groupKey)
      out.push({
        href: e.item.href,
        label,
        hint,
        icon: e.item.icon,
        haystack: [label, hint, ...(e.item.keywords ?? [])].join(' ').toLowerCase(),
      })
    }
    return out
  }, [t, tTop, canAccess])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    const words = q.split(/\s+/)
    return rows
      .filter(r => words.every(w => r.haystack.includes(w)))
      .sort((a, b) => Number(b.label.toLowerCase().startsWith(q)) - Number(a.label.toLowerCase().startsWith(q)))
  }, [rows, query])

  useEffect(() => { setCursor(0) }, [query])

  if (!open) return null

  const go = (href: string) => {
    onOpenChange(false)
    router.push(href)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onOpenChange(false)
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    else if (e.key === 'Enter' && results[cursor]) { e.preventDefault(); go(results[cursor].href) }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] px-4" role="dialog" aria-modal="true" aria-label={tTop('search')}>
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b border-gray-100">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={tTop('searchPlaceholder')}
            className="flex-1 py-3 text-sm outline-none bg-transparent"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-results"
          />
          <kbd className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul id="command-palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && (
            <li className="px-4 py-6 text-sm text-gray-500 text-center">{tTop('noResults')}</li>
          )}
          {results.map((r, i) => {
            const Icon = r.icon
            return (
              <li key={r.href} role="option" aria-selected={i === cursor}>
                <button
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(r.href)}
                  className={`flex items-center gap-3 w-full px-4 py-2 text-left text-sm ${i === cursor ? 'bg-primary-50 text-primary-700' : 'text-gray-700'}`}
                >
                  <Icon className="w-4 h-4 shrink-0 text-gray-500" />
                  <span className="flex-1 truncate">{r.label}</span>
                  <span className="text-xs text-gray-400 truncate max-w-[45%]">{r.hint}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
