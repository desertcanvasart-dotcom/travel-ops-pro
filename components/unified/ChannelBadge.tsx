'use client'

import { MessageSquare, Mail, Plane } from 'lucide-react'
import { ConversationChannel } from '@/types/unified'
import { useTranslations } from 'next-intl'

interface ChannelBadgeProps {
  channel: ConversationChannel
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

const channelConfig = {
  whatsapp: {
    labelKey: 'whatsapp',
    bgColor: 'bg-[#25D366]',
    textColor: 'text-white',
    lightBg: 'bg-[#25D366]/10',
    lightText: 'text-[#25D366]',
    icon: MessageSquare,
  },
  email: {
    labelKey: 'email',
    bgColor: 'bg-blue-500',
    textColor: 'text-white',
    lightBg: 'bg-blue-50',
    lightText: 'text-blue-600',
    icon: Mail,
  },
  // The traveller writing from their own booking page. The brand green marks
  // it as ours rather than a carrier's, which is exactly what it is.
  portal: {
    labelKey: 'portal',
    bgColor: 'bg-[#647C47]',
    textColor: 'text-white',
    lightBg: 'bg-[#647C47]/10',
    lightText: 'text-[#647C47]',
    icon: Plane,
  },
}

export function ChannelBadge({ channel, size = 'sm', showLabel = false }: ChannelBadgeProps) {
  const t = useTranslations('channels')
  const config = channelConfig[channel]
  const Icon = config.icon

  const sizeClasses = {
    sm: {
      container: 'px-1.5 py-0.5 text-xs gap-1',
      icon: 'w-3 h-3',
    },
    md: {
      container: 'px-2 py-1 text-sm gap-1.5',
      icon: 'w-4 h-4',
    },
    lg: {
      container: 'px-3 py-1.5 text-base gap-2',
      icon: 'w-5 h-5',
    },
  }

  const classes = sizeClasses[size]

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${classes.container} ${config.bgColor} ${config.textColor}`}
    >
      <Icon className={classes.icon} />
      {showLabel && <span>{t(config.labelKey)}</span>}
    </span>
  )
}

// Light variant for use in lists
export function ChannelBadgeLight({ channel, size = 'sm', showLabel = true }: ChannelBadgeProps) {
  const t = useTranslations('channels')
  const config = channelConfig[channel]
  const Icon = config.icon

  const sizeClasses = {
    sm: {
      container: 'px-1.5 py-0.5 text-xs gap-1',
      icon: 'w-3 h-3',
    },
    md: {
      container: 'px-2 py-1 text-sm gap-1.5',
      icon: 'w-4 h-4',
    },
    lg: {
      container: 'px-3 py-1.5 text-base gap-2',
      icon: 'w-5 h-5',
    },
  }

  const classes = sizeClasses[size]

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${classes.container} ${config.lightBg} ${config.lightText}`}
    >
      <Icon className={classes.icon} />
      {showLabel && <span>{t(config.labelKey)}</span>}
    </span>
  )
}

// Icon-only version for compact displays
export function ChannelIcon({ channel, size = 'sm' }: { channel: ConversationChannel; size?: 'sm' | 'md' | 'lg' }) {
  const config = channelConfig[channel]
  const Icon = config.icon

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }

  return <Icon className={`${sizeClasses[size]} ${config.lightText}`} />
}

export default ChannelBadge
