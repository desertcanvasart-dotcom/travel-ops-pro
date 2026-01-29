# Internationalization (i18n) Implementation Plan

## Overview

Add Japanese language support to Travel Ops Pro, enabling:
- **Cairo Office**: English (default)
- **Tokyo Office**: Japanese

---

## Architecture Decision

### Recommended: User-based Language Preference

Each user selects their preferred language in Settings. The app renders in that language regardless of URL.

**Why this approach:**
- Simpler URL structure (no `/en/` or `/ja/` prefixes)
- Works well for SaaS applications with authenticated users
- Language preference persists across sessions
- Easier to implement with existing auth system

---

## Technology Stack

### Library: `next-intl`

```bash
npm install next-intl
```

**Why next-intl:**
- Built specifically for Next.js App Router
- Full TypeScript support
- Server and Client component support
- Message formatting (dates, numbers, plurals)
- ICU message syntax support

---

## Phase 1: Infrastructure Setup (Days 1-3)

### 1.1 Install Dependencies

```bash
npm install next-intl
```

### 1.2 Create Directory Structure

```
travel-ops-pro/
├── messages/
│   ├── en.json          # English translations
│   └── ja.json          # Japanese translations
├── i18n/
│   ├── config.ts        # i18n configuration
│   ├── request.ts       # Server-side locale detection
│   └── navigation.ts    # Localized navigation helpers
```

### 1.3 Create i18n Configuration

**File: `i18n/config.ts`**
```typescript
export const locales = ['en', 'ja'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

export const localeNames: Record<Locale, string> = {
  en: 'English',
  ja: '日本語'
}

export const localeFlags: Record<Locale, string> = {
  en: '🇬🇧',
  ja: '🇯🇵'
}
```

**File: `i18n/request.ts`**
```typescript
import { getRequestConfig } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { defaultLocale, type Locale } from './config'

export default getRequestConfig(async () => {
  // Get user's preferred locale from database
  let locale: Locale = defaultLocale

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data: profile } = await supabase
        .from('users')
        .select('preferred_language')
        .eq('id', user.id)
        .single()

      if (profile?.preferred_language) {
        locale = profile.preferred_language as Locale
      }
    }
  } catch (error) {
    console.error('Error fetching user locale:', error)
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  }
})
```

### 1.4 Update Next.js Configuration

**File: `next.config.js`**
```javascript
const createNextIntlPlugin = require('next-intl/plugin')

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // existing config...
}

module.exports = withNextIntl(nextConfig)
```

### 1.5 Add Database Column

```sql
-- Add preferred_language column to users table
ALTER TABLE users
ADD COLUMN preferred_language VARCHAR(5) DEFAULT 'en';

-- Add comment for documentation
COMMENT ON COLUMN users.preferred_language IS 'User preferred UI language (en, ja)';
```

### 1.6 Create Provider Wrapper

**File: `app/providers/IntlProvider.tsx`**
```typescript
'use client'

import { NextIntlClientProvider } from 'next-intl'
import { ReactNode } from 'react'

interface IntlProviderProps {
  children: ReactNode
  locale: string
  messages: Record<string, any>
}

export function IntlProvider({ children, locale, messages }: IntlProviderProps) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  )
}
```

### 1.7 Update Root Layout

**File: `app/layout.tsx`**
```typescript
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {/* existing providers */}
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
```

---

## Phase 2: Create Base Translation Files (Days 4-7)

### 2.1 English Base File Structure

**File: `messages/en.json`**
```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "add": "Add",
    "search": "Search",
    "loading": "Loading...",
    "error": "Error",
    "success": "Success",
    "confirm": "Confirm",
    "back": "Back",
    "next": "Next",
    "submit": "Submit",
    "close": "Close",
    "yes": "Yes",
    "no": "No",
    "all": "All",
    "none": "None",
    "select": "Select",
    "required": "Required",
    "optional": "Optional"
  },

  "navigation": {
    "main": "Main",
    "dashboard": "Dashboard",
    "analytics": "Analytics",
    "crm": "CRM",
    "clients": "Clients",
    "staff": "Staff",
    "followups": "Follow-ups",
    "communication": "Communication",
    "unifiedInbox": "Unified Inbox",
    "whatsappInbox": "WhatsApp Inbox",
    "emailInbox": "Email Inbox",
    "whatsappParser": "WhatsApp Parser",
    "operations": "Operations",
    "itineraries": "Itineraries",
    "quotes": "Quotes",
    "suppliers": "Suppliers",
    "rates": "Rates",
    "finance": "Finance",
    "invoices": "Invoices",
    "payments": "Payments",
    "commissions": "Commissions",
    "settings": "Settings"
  },

  "dashboard": {
    "welcomeBack": "Welcome Back",
    "quickActions": "Quick Actions",
    "recentActivity": "Recent Activity",
    "pendingFollowups": "Pending Follow-ups",
    "todaysTasks": "Today's Tasks",
    "newClients": "New Clients",
    "activeItineraries": "Active Itineraries",
    "unreadMessages": "Unread Messages"
  },

  "clients": {
    "title": "Clients",
    "addClient": "Add Client",
    "editClient": "Edit Client",
    "deleteClient": "Delete Client",
    "clientDetails": "Client Details",
    "contactInfo": "Contact Information",
    "name": "Name",
    "email": "Email",
    "phone": "Phone",
    "company": "Company",
    "address": "Address",
    "notes": "Notes",
    "tier": "Tier",
    "source": "Source",
    "createdAt": "Created At",
    "lastContact": "Last Contact"
  },

  "communications": {
    "title": "Communications",
    "unifiedInbox": "Unified Inbox",
    "conversations": "conversations",
    "unread": "unread",
    "whatsapp": "WhatsApp",
    "email": "Email",
    "searchPlaceholder": "Search by name, email, or subject...",
    "noConversations": "No conversations found",
    "selectConversation": "Select a conversation to view messages",
    "typeMessage": "Type a message...",
    "send": "Send",
    "markAsRead": "Mark as read",
    "markAsUnread": "Mark as unread",
    "archive": "Archive",
    "delete": "Delete",
    "assignTo": "Assign to",
    "unassigned": "Unassigned",
    "generateItinerary": "Generate Itinerary",
    "viewClient": "View Client",
    "createClient": "Create Client"
  },

  "itineraries": {
    "title": "Itineraries",
    "createItinerary": "Create Itinerary",
    "editItinerary": "Edit Itinerary",
    "tripDetails": "Trip Details",
    "travelers": "Travelers",
    "startDate": "Start Date",
    "endDate": "End Date",
    "destination": "Destination",
    "accommodation": "Accommodation",
    "transportation": "Transportation",
    "activities": "Activities",
    "totalCost": "Total Cost",
    "status": "Status",
    "draft": "Draft",
    "confirmed": "Confirmed",
    "completed": "Completed",
    "cancelled": "Cancelled"
  },

  "quotes": {
    "title": "Quotes",
    "createQuote": "Create Quote",
    "quoteDetails": "Quote Details",
    "validUntil": "Valid Until",
    "subtotal": "Subtotal",
    "tax": "Tax",
    "total": "Total",
    "convertToInvoice": "Convert to Invoice",
    "sendToClient": "Send to Client"
  },

  "invoices": {
    "title": "Invoices",
    "createInvoice": "Create Invoice",
    "invoiceNumber": "Invoice Number",
    "dueDate": "Due Date",
    "paid": "Paid",
    "unpaid": "Unpaid",
    "overdue": "Overdue",
    "partial": "Partial",
    "markAsPaid": "Mark as Paid",
    "sendReminder": "Send Reminder",
    "downloadPdf": "Download PDF"
  },

  "settings": {
    "title": "Settings",
    "profile": "Profile",
    "preferences": "Preferences",
    "language": "Language",
    "timezone": "Timezone",
    "notifications": "Notifications",
    "emailNotifications": "Email Notifications",
    "integrations": "Integrations",
    "whatsappSettings": "WhatsApp Settings",
    "gmailSettings": "Gmail Settings",
    "security": "Security",
    "changePassword": "Change Password",
    "twoFactorAuth": "Two-Factor Authentication"
  },

  "auth": {
    "login": "Login",
    "logout": "Logout",
    "signup": "Sign Up",
    "forgotPassword": "Forgot Password",
    "resetPassword": "Reset Password",
    "emailAddress": "Email Address",
    "password": "Password",
    "confirmPassword": "Confirm Password",
    "rememberMe": "Remember Me",
    "dontHaveAccount": "Don't have an account?",
    "alreadyHaveAccount": "Already have an account?",
    "signInWith": "Sign in with"
  },

  "errors": {
    "somethingWentWrong": "Something went wrong",
    "notFound": "Not found",
    "unauthorized": "Unauthorized",
    "forbidden": "Forbidden",
    "validationError": "Validation error",
    "networkError": "Network error",
    "tryAgain": "Please try again",
    "contactSupport": "Contact support if the problem persists"
  },

  "confirmations": {
    "deleteTitle": "Delete Confirmation",
    "deleteMessage": "Are you sure you want to delete this item? This action cannot be undone.",
    "unsavedChanges": "You have unsaved changes. Are you sure you want to leave?"
  },

  "dates": {
    "today": "Today",
    "yesterday": "Yesterday",
    "tomorrow": "Tomorrow",
    "thisWeek": "This Week",
    "lastWeek": "Last Week",
    "thisMonth": "This Month",
    "lastMonth": "Last Month"
  },

  "formats": {
    "dateShort": "{date, date, short}",
    "dateLong": "{date, date, long}",
    "time": "{time, time, short}",
    "currency": "{amount, number, currency}",
    "percent": "{value, number, percent}"
  }
}
```

### 2.2 Japanese Translation File

**File: `messages/ja.json`**
```json
{
  "common": {
    "save": "保存",
    "cancel": "キャンセル",
    "delete": "削除",
    "edit": "編集",
    "add": "追加",
    "search": "検索",
    "loading": "読み込み中...",
    "error": "エラー",
    "success": "成功",
    "confirm": "確認",
    "back": "戻る",
    "next": "次へ",
    "submit": "送信",
    "close": "閉じる",
    "yes": "はい",
    "no": "いいえ",
    "all": "すべて",
    "none": "なし",
    "select": "選択",
    "required": "必須",
    "optional": "任意"
  },

  "navigation": {
    "main": "メイン",
    "dashboard": "ダッシュボード",
    "analytics": "分析",
    "crm": "顧客管理",
    "clients": "顧客",
    "staff": "スタッフ",
    "followups": "フォローアップ",
    "communication": "コミュニケーション",
    "unifiedInbox": "統合受信トレイ",
    "whatsappInbox": "WhatsApp受信トレイ",
    "emailInbox": "メール受信トレイ",
    "whatsappParser": "WhatsApp解析",
    "operations": "オペレーション",
    "itineraries": "旅程",
    "quotes": "見積もり",
    "suppliers": "サプライヤー",
    "rates": "料金",
    "finance": "財務",
    "invoices": "請求書",
    "payments": "支払い",
    "commissions": "コミッション",
    "settings": "設定"
  },

  "dashboard": {
    "welcomeBack": "おかえりなさい",
    "quickActions": "クイックアクション",
    "recentActivity": "最近のアクティビティ",
    "pendingFollowups": "保留中のフォローアップ",
    "todaysTasks": "今日のタスク",
    "newClients": "新規顧客",
    "activeItineraries": "進行中の旅程",
    "unreadMessages": "未読メッセージ"
  },

  "clients": {
    "title": "顧客",
    "addClient": "顧客を追加",
    "editClient": "顧客を編集",
    "deleteClient": "顧客を削除",
    "clientDetails": "顧客詳細",
    "contactInfo": "連絡先情報",
    "name": "名前",
    "email": "メールアドレス",
    "phone": "電話番号",
    "company": "会社",
    "address": "住所",
    "notes": "メモ",
    "tier": "ティア",
    "source": "ソース",
    "createdAt": "作成日",
    "lastContact": "最終連絡日"
  },

  "communications": {
    "title": "コミュニケーション",
    "unifiedInbox": "統合受信トレイ",
    "conversations": "件の会話",
    "unread": "件の未読",
    "whatsapp": "WhatsApp",
    "email": "メール",
    "searchPlaceholder": "名前、メール、件名で検索...",
    "noConversations": "会話が見つかりません",
    "selectConversation": "メッセージを表示するには会話を選択してください",
    "typeMessage": "メッセージを入力...",
    "send": "送信",
    "markAsRead": "既読にする",
    "markAsUnread": "未読にする",
    "archive": "アーカイブ",
    "delete": "削除",
    "assignTo": "担当者",
    "unassigned": "未割り当て",
    "generateItinerary": "旅程を作成",
    "viewClient": "顧客を表示",
    "createClient": "顧客を作成"
  },

  "itineraries": {
    "title": "旅程",
    "createItinerary": "旅程を作成",
    "editItinerary": "旅程を編集",
    "tripDetails": "旅行詳細",
    "travelers": "旅行者",
    "startDate": "開始日",
    "endDate": "終了日",
    "destination": "目的地",
    "accommodation": "宿泊施設",
    "transportation": "交通手段",
    "activities": "アクティビティ",
    "totalCost": "合計金額",
    "status": "ステータス",
    "draft": "下書き",
    "confirmed": "確定",
    "completed": "完了",
    "cancelled": "キャンセル"
  },

  "quotes": {
    "title": "見積もり",
    "createQuote": "見積もりを作成",
    "quoteDetails": "見積もり詳細",
    "validUntil": "有効期限",
    "subtotal": "小計",
    "tax": "税金",
    "total": "合計",
    "convertToInvoice": "請求書に変換",
    "sendToClient": "顧客に送信"
  },

  "invoices": {
    "title": "請求書",
    "createInvoice": "請求書を作成",
    "invoiceNumber": "請求書番号",
    "dueDate": "支払期日",
    "paid": "支払済み",
    "unpaid": "未払い",
    "overdue": "延滞",
    "partial": "一部支払い",
    "markAsPaid": "支払済みにする",
    "sendReminder": "リマインダーを送信",
    "downloadPdf": "PDFをダウンロード"
  },

  "settings": {
    "title": "設定",
    "profile": "プロフィール",
    "preferences": "環境設定",
    "language": "言語",
    "timezone": "タイムゾーン",
    "notifications": "通知",
    "emailNotifications": "メール通知",
    "integrations": "連携",
    "whatsappSettings": "WhatsApp設定",
    "gmailSettings": "Gmail設定",
    "security": "セキュリティ",
    "changePassword": "パスワードを変更",
    "twoFactorAuth": "二要素認証"
  },

  "auth": {
    "login": "ログイン",
    "logout": "ログアウト",
    "signup": "新規登録",
    "forgotPassword": "パスワードをお忘れですか？",
    "resetPassword": "パスワードをリセット",
    "emailAddress": "メールアドレス",
    "password": "パスワード",
    "confirmPassword": "パスワードを確認",
    "rememberMe": "ログイン状態を保持",
    "dontHaveAccount": "アカウントをお持ちでないですか？",
    "alreadyHaveAccount": "すでにアカウントをお持ちですか？",
    "signInWith": "でサインイン"
  },

  "errors": {
    "somethingWentWrong": "問題が発生しました",
    "notFound": "見つかりません",
    "unauthorized": "認証されていません",
    "forbidden": "アクセスが拒否されました",
    "validationError": "入力エラー",
    "networkError": "ネットワークエラー",
    "tryAgain": "もう一度お試しください",
    "contactSupport": "問題が解決しない場合はサポートにお問い合わせください"
  },

  "confirmations": {
    "deleteTitle": "削除の確認",
    "deleteMessage": "本当に削除しますか？この操作は取り消せません。",
    "unsavedChanges": "保存されていない変更があります。このページを離れますか？"
  },

  "dates": {
    "today": "今日",
    "yesterday": "昨日",
    "tomorrow": "明日",
    "thisWeek": "今週",
    "lastWeek": "先週",
    "thisMonth": "今月",
    "lastMonth": "先月"
  },

  "formats": {
    "dateShort": "{date, date, short}",
    "dateLong": "{date, date, long}",
    "time": "{time, time, short}",
    "currency": "{amount, number, currency}",
    "percent": "{value, number, percent}"
  }
}
```

---

## Phase 3: Core UI Integration (Days 8-14)

### 3.1 Create Translation Hook

**File: `hooks/useTranslation.ts`**
```typescript
import { useTranslations } from 'next-intl'

export function useT(namespace?: string) {
  return useTranslations(namespace)
}

// Convenience hooks for common namespaces
export function useCommonT() {
  return useTranslations('common')
}

export function useNavT() {
  return useTranslations('navigation')
}

export function useErrorT() {
  return useTranslations('errors')
}
```

### 3.2 Update Sidebar Navigation

**File: `components/Sidebar.tsx`** (key changes)
```typescript
'use client'

import { useTranslations } from 'next-intl'

export default function Sidebar({ isCollapsed, setIsCollapsed }: SidebarProps) {
  const t = useTranslations('navigation')

  const navigation: NavSection[] = [
    {
      title: t('main'),
      key: 'main',
      items: [
        { label: t('dashboard'), href: '/dashboard', icon: LayoutDashboard },
        { label: t('analytics'), href: '/analytics', icon: TrendingUp },
      ]
    },
    {
      title: t('crm'),
      key: 'crm',
      roles: ['admin', 'manager', 'agent'],
      items: [
        { label: t('clients'), href: '/clients', icon: Users },
        { label: t('staff'), href: '/contacts?type=staff', icon: UserCog },
        { label: t('followups'), href: '/followups', icon: CheckSquare },
      ]
    },
    // ... continue for all sections
  ]

  // rest of component
}
```

### 3.3 Update Unified Inbox Component

**File: `components/unified/UnifiedMessageThread.tsx`** (key changes)
```typescript
import { useTranslations } from 'next-intl'

export function UnifiedMessageThread({ ... }) {
  const t = useTranslations('communications')
  const tCommon = useTranslations('common')

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
        {/* ... */}

        {/* Client Link */}
        {conversation.client_id ? (
          <Link href={`/clients/${conversation.client_id}`}>
            <User className="w-3.5 h-3.5" />
            {t('viewClient')}
          </Link>
        ) : (
          <Link href={`/clients/new?...`}>
            <Plus className="w-3.5 h-3.5" />
            {t('createClient')}
          </Link>
        )}

        {/* Generate Itinerary */}
        <button onClick={handleParseConversation}>
          <Sparkles className="w-3.5 h-3.5" />
          {t('generateItinerary')}
        </button>

        {/* Action buttons with translated titles */}
        <button title={t('markAsRead')}>
          <MailOpen className="w-3.5 h-3.5" />
        </button>

        <button title={t('archive')}>
          <Archive className="w-3.5 h-3.5" />
        </button>

        <button title={t('delete')}>
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {/* ... */}
      </div>

      {/* Message input placeholder */}
      <input
        placeholder={t('typeMessage')}
        // ...
      />
    </div>
  )
}
```

### 3.4 Update Dashboard

**File: `app/dashboard/page.tsx`** (key changes)
```typescript
import { useTranslations } from 'next-intl'

export default function DashboardPage() {
  const t = useTranslations('dashboard')

  return (
    <div>
      <h1>{t('welcomeBack')}, {user.name}</h1>

      <section>
        <h2>{t('quickActions')}</h2>
        {/* ... */}
      </section>

      <section>
        <h2>{t('pendingFollowups')}</h2>
        {/* ... */}
      </section>
    </div>
  )
}
```

### 3.5 Language Selector Component

**File: `components/LanguageSelector.tsx`**
```typescript
'use client'

import { useState, useTransition } from 'react'
import { useLocale } from 'next-intl'
import { Globe, Check, Loader2 } from 'lucide-react'
import { locales, localeNames, localeFlags, type Locale } from '@/i18n/config'

interface LanguageSelectorProps {
  onLanguageChange: (locale: Locale) => Promise<void>
}

export function LanguageSelector({ onLanguageChange }: LanguageSelectorProps) {
  const currentLocale = useLocale() as Locale
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleSelect = (locale: Locale) => {
    if (locale === currentLocale) {
      setIsOpen(false)
      return
    }

    startTransition(async () => {
      await onLanguageChange(locale)
      setIsOpen(false)
      // Refresh the page to apply new locale
      window.location.reload()
    })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
        disabled={isPending}
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Globe className="w-4 h-4 text-gray-500" />
        )}
        <span>{localeFlags[currentLocale]}</span>
        <span>{localeNames[currentLocale]}</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
            {locales.map((locale) => (
              <button
                key={locale}
                type="button"
                onClick={() => handleSelect(locale)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 ${
                  locale === currentLocale ? 'bg-primary-50 text-primary-700' : ''
                }`}
              >
                <span className="text-lg">{localeFlags[locale]}</span>
                <span className="flex-1 text-left">{localeNames[locale]}</span>
                {locale === currentLocale && (
                  <Check className="w-4 h-4 text-primary-600" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

### 3.6 Add Language Setting to Settings Page

**File: `app/settings/page.tsx`** (add to preferences section)
```typescript
import { LanguageSelector } from '@/components/LanguageSelector'

// In the preferences section:
<div className="space-y-4">
  <h3 className="text-sm font-medium text-gray-900">{t('language')}</h3>
  <LanguageSelector
    onLanguageChange={async (locale) => {
      // Update user's preferred language in database
      await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferred_language: locale })
      })
    }}
  />
</div>
```

### 3.7 API Route for Language Preference

**File: `app/api/user/preferences/route.ts`**
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { preferred_language } = body

  // Validate locale
  const validLocales = ['en', 'ja']
  if (preferred_language && !validLocales.includes(preferred_language)) {
    return NextResponse.json({ error: 'Invalid language' }, { status: 400 })
  }

  const { error } = await supabase
    .from('users')
    .update({ preferred_language })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

---

## Phase 4: Form & Validation Messages (Days 15-21)

### 4.1 Form Validation Messages

**Add to `messages/en.json`:**
```json
{
  "validation": {
    "required": "{field} is required",
    "email": "Please enter a valid email address",
    "minLength": "{field} must be at least {min} characters",
    "maxLength": "{field} must be no more than {max} characters",
    "phone": "Please enter a valid phone number",
    "date": "Please enter a valid date",
    "number": "Please enter a valid number",
    "positiveNumber": "Please enter a positive number",
    "url": "Please enter a valid URL",
    "passwordMatch": "Passwords do not match",
    "passwordStrength": "Password must contain at least 8 characters, including uppercase, lowercase, and a number"
  }
}
```

**Add to `messages/ja.json`:**
```json
{
  "validation": {
    "required": "{field}は必須です",
    "email": "有効なメールアドレスを入力してください",
    "minLength": "{field}は{min}文字以上で入力してください",
    "maxLength": "{field}は{max}文字以内で入力してください",
    "phone": "有効な電話番号を入力してください",
    "date": "有効な日付を入力してください",
    "number": "有効な数値を入力してください",
    "positiveNumber": "正の数を入力してください",
    "url": "有効なURLを入力してください",
    "passwordMatch": "パスワードが一致しません",
    "passwordStrength": "パスワードは8文字以上で、大文字、小文字、数字を含む必要があります"
  }
}
```

### 4.2 Create Localized Form Validation Hook

**File: `hooks/useLocalizedValidation.ts`**
```typescript
import { useTranslations } from 'next-intl'

export function useLocalizedValidation() {
  const t = useTranslations('validation')

  return {
    required: (field: string) => t('required', { field }),
    email: () => t('email'),
    minLength: (field: string, min: number) => t('minLength', { field, min }),
    maxLength: (field: string, max: number) => t('maxLength', { field, max }),
    phone: () => t('phone'),
    // ... etc
  }
}
```

---

## Phase 5: Date/Number Formatting (Days 22-25)

### 5.1 Create Formatting Utilities

**File: `lib/i18n/formatters.ts`**
```typescript
import { useFormatter, useLocale } from 'next-intl'

export function useLocalizedFormatters() {
  const format = useFormatter()
  const locale = useLocale()

  return {
    formatDate: (date: Date | string, style: 'short' | 'medium' | 'long' = 'medium') => {
      const d = typeof date === 'string' ? new Date(date) : date
      return format.dateTime(d, {
        dateStyle: style
      })
    },

    formatTime: (date: Date | string) => {
      const d = typeof date === 'string' ? new Date(date) : date
      return format.dateTime(d, {
        timeStyle: 'short'
      })
    },

    formatCurrency: (amount: number, currency = 'USD') => {
      return format.number(amount, {
        style: 'currency',
        currency
      })
    },

    formatNumber: (num: number) => {
      return format.number(num)
    },

    formatRelativeTime: (date: Date | string) => {
      const d = typeof date === 'string' ? new Date(date) : date
      return format.relativeTime(d)
    }
  }
}
```

### 5.2 Japanese-Specific Date Formatting

Japanese dates typically use: 2024年1月29日 (YYYY年M月D日)

The `next-intl` library handles this automatically based on locale.

---

## Phase 6: PDF Generation (Days 26-30)

### 6.1 Localized PDF Templates

PDFs require special handling since they're generated server-side.

**File: `lib/pdf/localized-invoice.ts`**
```typescript
import { getTranslations } from 'next-intl/server'

export async function generateLocalizedInvoice(data: InvoiceData, locale: string) {
  const t = await getTranslations({ locale, namespace: 'invoices' })

  return `
    <html lang="${locale}">
      <head>
        <style>
          ${locale === 'ja' ? `
            body { font-family: 'Noto Sans JP', sans-serif; }
          ` : `
            body { font-family: 'Inter', sans-serif; }
          `}
        </style>
      </head>
      <body>
        <h1>${t('title')}</h1>
        <p>${t('invoiceNumber')}: ${data.invoiceNumber}</p>
        <p>${t('dueDate')}: ${formatDate(data.dueDate, locale)}</p>
        <!-- ... -->
      </body>
    </html>
  `
}
```

### 6.2 Japanese Font Support

Add Japanese font support for PDFs:

```bash
# Install Japanese font for PDF generation
npm install @fontsource/noto-sans-jp
```

---

## Phase 7: Testing & QA (Days 31-35)

### 7.1 Testing Checklist

**Functional Testing:**
- [ ] Language selector works correctly
- [ ] Language preference persists after logout/login
- [ ] All navigation items display correctly in both languages
- [ ] All form labels and placeholders are translated
- [ ] All error messages display in correct language
- [ ] All success/confirmation messages are translated
- [ ] Date formats are correct for each locale
- [ ] Number formats are correct for each locale
- [ ] Currency displays correctly

**Visual Testing:**
- [ ] Japanese text doesn't break layouts
- [ ] Longer/shorter text fits in buttons and labels
- [ ] PDFs render correctly with Japanese fonts
- [ ] Email templates render correctly

**Edge Cases:**
- [ ] User switches language mid-session
- [ ] New user (no preference set) defaults to English
- [ ] API errors display in correct language

### 7.2 E2E Test Example

```typescript
// tests/i18n.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Internationalization', () => {
  test('should switch to Japanese', async ({ page }) => {
    await page.goto('/settings')

    // Open language selector
    await page.click('[data-testid="language-selector"]')

    // Select Japanese
    await page.click('text=日本語')

    // Wait for page reload
    await page.waitForLoadState('networkidle')

    // Verify navigation is in Japanese
    await expect(page.locator('text=ダッシュボード')).toBeVisible()
    await expect(page.locator('text=設定')).toBeVisible()
  })
})
```

---

## Phase 8: Deployment & Monitoring

### 8.1 Environment Variables

No additional environment variables needed for `next-intl`.

### 8.2 Database Migration Script

```sql
-- Run this migration before deploying i18n feature
ALTER TABLE users
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) DEFAULT 'en';

-- Set existing Cairo users to English (if identifiable)
-- UPDATE users SET preferred_language = 'en' WHERE ...;

-- Set existing Tokyo users to Japanese (if identifiable)
-- UPDATE users SET preferred_language = 'ja' WHERE ...;
```

### 8.3 Monitoring

Track language usage in analytics:
- Number of users per language
- Language switch frequency
- Pages with missing translations (if any)

---

## Summary Timeline

| Phase | Description | Duration | Cumulative |
|-------|-------------|----------|------------|
| 1 | Infrastructure Setup | 3 days | Day 3 |
| 2 | Base Translation Files | 4 days | Day 7 |
| 3 | Core UI Integration | 7 days | Day 14 |
| 4 | Forms & Validation | 7 days | Day 21 |
| 5 | Date/Number Formatting | 4 days | Day 25 |
| 6 | PDF Generation | 5 days | Day 30 |
| 7 | Testing & QA | 5 days | Day 35 |
| 8 | Deployment | 2 days | Day 37 |

**Total: ~7-8 weeks**

---

## Files to Create

```
├── i18n/
│   ├── config.ts
│   ├── request.ts
│   └── navigation.ts
├── messages/
│   ├── en.json
│   └── ja.json
├── hooks/
│   ├── useTranslation.ts
│   └── useLocalizedValidation.ts
├── components/
│   └── LanguageSelector.tsx
├── lib/
│   └── i18n/
│       └── formatters.ts
├── app/
│   └── api/
│       └── user/
│           └── preferences/
│               └── route.ts
```

## Files to Modify

```
├── next.config.js (add next-intl plugin)
├── app/layout.tsx (add IntlProvider)
├── components/Sidebar.tsx (use translations)
├── components/unified/UnifiedMessageThread.tsx
├── components/unified/UnifiedConversationList.tsx
├── app/dashboard/page.tsx
├── app/settings/page.tsx
├── app/clients/page.tsx
├── app/itineraries/page.tsx
├── app/quotes/page.tsx
├── app/invoices/page.tsx
└── (all other pages with hardcoded text)
```

---

## Next Steps

1. **Approve this plan** - Review and confirm approach
2. **Start Phase 1** - Install dependencies and set up infrastructure
3. **Create translation files** - Begin with core UI strings
4. **Incremental rollout** - Start with Settings page, then expand

Would you like me to begin implementation starting with Phase 1?
