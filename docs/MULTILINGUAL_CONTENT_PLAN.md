# Multilingual Content System - Technical Implementation Plan

## Overview

This document outlines the implementation plan for a linked language versions system that allows content (itineraries, quotes, tour templates) to exist in multiple languages while maintaining a single reference code.

---

## 1. Database Schema Changes

### 1.1 New Tables

```sql
-- Language versions for itineraries
CREATE TABLE itinerary_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  language VARCHAR(2) NOT NULL CHECK (language IN ('en', 'ja')),

  -- Translatable content
  title TEXT NOT NULL,
  description TEXT,
  internal_notes TEXT,
  day_details JSONB,  -- Array of day-by-day descriptions
  inclusions TEXT[],
  exclusions TEXT[],
  important_notes TEXT[],

  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(itinerary_id, language)
);

-- Language versions for tour templates
CREATE TABLE tour_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES tour_templates(id) ON DELETE CASCADE,
  language VARCHAR(2) NOT NULL CHECK (language IN ('en', 'ja')),

  -- Translatable content
  template_name TEXT NOT NULL,
  short_description TEXT,
  long_description TEXT,
  highlights TEXT[],
  inclusions TEXT[],
  exclusions TEXT[],
  day_itinerary JSONB,

  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(template_id, language)
);

-- Language versions for quotes
CREATE TABLE quote_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  language VARCHAR(2) NOT NULL CHECK (language IN ('en', 'ja')),

  -- Translatable content
  title TEXT,
  notes TEXT,
  terms_conditions TEXT,

  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(quote_id, language)
);

-- User language preferences
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(2) DEFAULT 'en';
ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_language VARCHAR(2) DEFAULT 'en';
```

### 1.2 Migration Strategy

```sql
-- Step 1: Create version tables
-- Step 2: Migrate existing data to EN versions
INSERT INTO itinerary_versions (itinerary_id, language, title, description, ...)
SELECT id, 'en', title, description, ...
FROM itineraries;

-- Step 3: Add available_languages computed column or view
CREATE OR REPLACE VIEW itineraries_with_languages AS
SELECT
  i.*,
  ARRAY_AGG(DISTINCT iv.language) AS available_languages,
  (SELECT COUNT(*) FROM itinerary_versions WHERE itinerary_id = i.id) AS version_count
FROM itineraries i
LEFT JOIN itinerary_versions iv ON i.id = iv.itinerary_id
GROUP BY i.id;
```

---

## 2. API Changes

### 2.1 New Endpoints

```
GET    /api/itineraries                    # List with language indicators
GET    /api/itineraries/:id                # Get master + all versions
GET    /api/itineraries/:id/versions       # List all language versions
GET    /api/itineraries/:id/versions/:lang # Get specific language version
POST   /api/itineraries/:id/versions       # Create new language version
PUT    /api/itineraries/:id/versions/:lang # Update language version
DELETE /api/itineraries/:id/versions/:lang # Delete language version

# Same pattern for tour-templates and quotes
```

### 2.2 Response Format Changes

```typescript
// Before
interface Itinerary {
  id: string;
  code: string;
  title: string;
  description: string;
  // ...
}

// After
interface Itinerary {
  id: string;
  code: string;
  available_languages: ('en' | 'ja')[];
  versions: {
    en?: ItineraryVersion;
    ja?: ItineraryVersion;
  };
  // Non-translatable fields remain at top level
  client_id: string;
  start_date: string;
  end_date: string;
  total_cost: number;
  status: string;
}

interface ItineraryVersion {
  language: 'en' | 'ja';
  title: string;
  description: string;
  day_details: DayDetail[];
  inclusions: string[];
  exclusions: string[];
  created_at: string;
  updated_at: string;
}
```

---

## 3. UI Components

### 3.1 Language Switcher (Global)

**Location**: Header or Sidebar footer

```tsx
// components/LanguageSwitcher.tsx
export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
      <button
        onClick={() => setLocale('en')}
        className={`px-3 py-1.5 rounded text-sm font-medium ${
          locale === 'en'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLocale('ja')}
        className={`px-3 py-1.5 rounded text-sm font-medium ${
          locale === 'ja'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        日本語
      </button>
    </div>
  );
}
```

### 3.2 Language Indicators in Lists

```tsx
// components/LanguageIndicator.tsx
interface Props {
  availableLanguages: string[];
}

export function LanguageIndicator({ availableLanguages }: Props) {
  return (
    <div className="flex items-center gap-1">
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
        availableLanguages.includes('en')
          ? 'bg-blue-100 text-blue-700'
          : 'bg-gray-100 text-gray-400'
      }`}>
        EN
      </span>
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
        availableLanguages.includes('ja')
          ? 'bg-red-100 text-red-700'
          : 'bg-gray-100 text-gray-400'
      }`}>
        JP
      </span>
    </div>
  );
}
```

### 3.3 Detail Page with Language Tabs

```tsx
// Example: Itinerary detail page
export function ItineraryDetail({ itinerary }: Props) {
  const [activeLanguage, setActiveLanguage] = useState<'en' | 'ja'>('en');
  const version = itinerary.versions[activeLanguage];

  return (
    <div>
      {/* Language Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => setActiveLanguage('en')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            activeLanguage === 'en'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          English {!itinerary.versions.en && '(Not created)'}
        </button>
        <button
          onClick={() => setActiveLanguage('ja')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            activeLanguage === 'ja'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          日本語 {!itinerary.versions.ja && '(未作成)'}
        </button>
      </div>

      {/* Content */}
      {version ? (
        <ItineraryContent version={version} />
      ) : (
        <CreateVersionPrompt
          itineraryId={itinerary.id}
          language={activeLanguage}
        />
      )}
    </div>
  );
}
```

### 3.4 "Add Translation" Action

```tsx
// When a version doesn't exist
export function CreateVersionPrompt({ itineraryId, language }: Props) {
  return (
    <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
      <Globe className="w-12 h-12 text-gray-400 mx-auto mb-3" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {language === 'ja' ? '日本語版がありません' : 'No English version'}
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        {language === 'ja'
          ? 'この旅程の日本語版を作成しますか？'
          : 'Would you like to create an English version of this itinerary?'
        }
      </p>
      <div className="flex items-center justify-center gap-3">
        <button className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm">
          Create from scratch
        </button>
        <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
          Copy & Translate
        </button>
      </div>
    </div>
  );
}
```

---

## 4. Type Definitions

```typescript
// types/multilingual.ts

export type Language = 'en' | 'ja';

export interface MultilingualEntity {
  id: string;
  available_languages: Language[];
}

export interface ItineraryVersion {
  id: string;
  itinerary_id: string;
  language: Language;
  title: string;
  description: string | null;
  day_details: DayDetail[];
  inclusions: string[];
  exclusions: string[];
  important_notes: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Itinerary extends MultilingualEntity {
  code: string;
  client_id: string;
  start_date: string;
  end_date: string;
  num_adults: number;
  num_children: number;
  total_cost: number;
  currency: string;
  status: string;
  versions: Partial<Record<Language, ItineraryVersion>>;
}

// Similar for TourTemplate, Quote, etc.
```

---

## 5. Implementation Phases

### Phase 1: UI Language Switcher (1-2 days)
- [x] Translation files already exist (en.json, ja.json)
- [ ] Add LanguageSwitcher component to Sidebar
- [ ] Store preference in localStorage
- [ ] Optionally save to user profile in database
- [ ] Fix remaining hardcoded English text

### Phase 2: Database Schema (1 day)
- [ ] Create migration file for version tables
- [ ] Run migration in Supabase
- [ ] Migrate existing data to EN versions
- [ ] Add indexes for performance

### Phase 3: Itineraries - First Entity (3-4 days)
- [ ] Update API routes for versions
- [ ] Update TypeScript types
- [ ] Update list page with language indicators
- [ ] Update detail page with language tabs
- [ ] Add create/edit version functionality
- [ ] Test thoroughly

### Phase 4: Tour Templates (2-3 days)
- [ ] Same changes as itineraries
- [ ] Update tour manager page
- [ ] Update browse page

### Phase 5: Quotes (2-3 days)
- [ ] Same changes as itineraries
- [ ] Update quote builder
- [ ] Update quote PDF generation for each language

### Phase 6: Translation Workflow (Optional Enhancement)
- [ ] "Copy & Translate" feature using AI
- [ ] Missing translation dashboard
- [ ] Batch translation tools

---

## 6. Files to Create/Modify

### New Files
```
components/
├── LanguageSwitcher.tsx
├── LanguageIndicator.tsx
├── LanguageTabs.tsx
└── CreateVersionPrompt.tsx

types/
└── multilingual.ts

lib/
└── language-context.tsx

migrations/
└── 20260203_add_language_versions.sql
```

### Modified Files
```
components/Sidebar.tsx          # Add language switcher
app/itineraries/page.tsx        # Add language indicators
app/itineraries/[id]/page.tsx   # Add language tabs
app/tours/manage/*              # Add language support
app/api/itineraries/*           # Update for versions
```

---

## 7. Testing Checklist

- [ ] UI language switches correctly
- [ ] Language preference persists across sessions
- [ ] List views show correct language indicators
- [ ] Detail views show correct language tabs
- [ ] Can create new language version
- [ ] Can edit existing language version
- [ ] Can delete language version (with confirmation)
- [ ] Search works across all language versions
- [ ] PDF generation respects selected language
- [ ] API returns correct data structure

---

## 8. Rollback Plan

If issues arise:
1. Version tables can be dropped without affecting core functionality
2. API can fall back to returning data in original format
3. UI components can be hidden via feature flag

---

## Next Steps

1. Review this plan with stakeholders
2. Prioritize Phase 1 (UI switcher) for immediate user benefit
3. Schedule Phase 2-5 for iterative implementation
4. Consider Phase 6 based on user feedback

---

*Document created: 2026-02-03*
*Status: Draft - Pending approval*
