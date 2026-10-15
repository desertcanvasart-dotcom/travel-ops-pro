'use client'

// ============================================
// An address field (To / Cc / Bcc) that suggests who to write to
// ============================================
// The field stays plain text — "a@b.c, Name <d@e.f>" — so pasting a list
// works as before. What is being typed after the last comma or semicolon is
// looked up (/api/email/recipients); picking a suggestion puts it in that
// place and leaves the field ready for the next address.

import { useEffect, useRef, useState } from 'react'
import { formatRecipient, type RecipientSuggestion } from '@/lib/email/recipient-suggestions'

const SOURCE_LABEL: Record<RecipientSuggestion['source'], string> = {
  client: 'Client',
  partner: 'Partner',
  supplier: 'Supplier',
  team: 'Team',
  email: 'Emailed before',
}

/** The address being typed: what follows the last separator. */
export function currentToken(value: string): { head: string; token: string } {
  const cut = Math.max(value.lastIndexOf(','), value.lastIndexOf(';'))
  return { head: cut >= 0 ? value.slice(0, cut + 1) : '', token: value.slice(cut + 1).trim() }
}

/** The field with the typed address replaced by the picked one. */
export function withPicked(value: string, picked: RecipientSuggestion): string {
  const { head } = currentToken(value)
  const before = head.trim()
  return `${before ? `${before} ` : ''}${formatRecipient(picked)}, `
}

export default function RecipientField({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [suggestions, setSuggestions] = useState<RecipientSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  const token = currentToken(value).token

  // Look up what is being typed, after a short pause; a slower, older answer
  // never replaces a newer one.
  useEffect(() => {
    if (token.length < 2 || (token.includes('@') && token.endsWith('>'))) {
      setSuggestions([])
      return
    }
    const mine = ++seq.current
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/email/recipients?q=${encodeURIComponent(token)}`)
        const data = await res.json().catch(() => ({}))
        if (mine !== seq.current) return
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : [])
        setActive(0)
      } catch {
        if (mine === seq.current) setSuggestions([])
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [token])

  const pick = (s: RecipientSuggestion) => {
    onChange(withPicked(value, s))
    setSuggestions([])
    setOpen(false)
    inputRef.current?.focus()
  }

  const showing = open && suggestions.length > 0

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        // Late enough for a click on a suggestion to land first.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!showing) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % suggestions.length) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + suggestions.length) % suggestions.length) }
          else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(suggestions[active]) }
          else if (e.key === 'Escape') { setOpen(false) }
        }}
        className="w-full text-sm outline-none bg-transparent"
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={showing}
        aria-autocomplete="list"
      />
      {showing && (
        <ul role="listbox" className="absolute left-0 right-0 top-full mt-1 z-30 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {suggestions.map((s, i) => (
            <li
              key={s.email}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(s) }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-1.5 cursor-pointer flex items-center gap-2 ${i === active ? 'bg-primary-50' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate">{s.name || s.email}</p>
                {s.name && <p className="text-xs text-gray-500 truncate">{s.email}</p>}
              </div>
              <span className="text-[10px] text-gray-400 flex-shrink-0">{SOURCE_LABEL[s.source]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
