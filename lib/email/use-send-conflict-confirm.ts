'use client'

// The question a composer asks when the duplicate guard stops a reply
// (lib/email/send-with-guard) — one wording for every composer.

import { useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import type { SendConflict } from '@/lib/email/send-with-guard'

export function useSendConflictConfirm() {
  const t = useTranslations('emailSendGuard')
  const locale = useLocale()
  const { confirm } = useConfirmDialog()
  return useCallback(async (c: SendConflict): Promise<boolean> => {
    const when = (iso?: string) => iso ? new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : ''
    const message = c.code === 'ALREADY_REPLIED'
      ? (c.repliedBy ? t('alreadyRepliedBy', { who: c.repliedBy, when: when(c.repliedAt) }) : t('alreadyReplied', { when: when(c.repliedAt) }))
      : t('sameReply', { when: when(c.sentAt) })
    return confirm({ title: t('title'), message, confirmText: t('sendAnyway'), variant: 'warning' })
  }, [confirm, locale, t])
}
