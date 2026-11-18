'use client'

import { useLayoutEffect, useRef } from 'react'

/**
 * Should this key press send the message? Enter sends; Shift+Enter starts a
 * new line (as in WhatsApp Web); the Enter that confirms a Japanese or
 * Chinese word (IME composition) must not send.
 */
export function shouldSendOnKey(e: { key: string; shiftKey: boolean; isComposing?: boolean; keyCode?: number }): boolean {
  if (e.key !== 'Enter' || e.shiftKey) return false
  // Safari reports the IME confirm as keyCode 229 with isComposing already false.
  if (e.isComposing || e.keyCode === 229) return false
  return true
}

/**
 * The message box under a conversation. A one-line <input> silently DROPS
 * every line break, so a pasted itinerary went out as one long paragraph.
 * This is a textarea that keeps line breaks and grows with the text up to
 * maxHeight, then scrolls inside.
 */
export default function MessageBox({
  value,
  onChange,
  onSend,
  placeholder,
  className = '',
  style,
  maxHeight = 200,
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  maxHeight?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [value, maxHeight])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => {
        if (shouldSendOnKey({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing, keyCode: e.nativeEvent.keyCode })) {
          e.preventDefault()
          onSend()
        }
      }}
      placeholder={placeholder}
      className={`resize-none leading-5 ${className}`}
      style={style}
    />
  )
}
