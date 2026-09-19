-- ============================================
-- One language, one spelling
-- ============================================
-- guide_rates held the same language twice: a row written before the guide
-- language vocabulary (2026-09-17) stored the WORD, "Japanese", and a row
-- written after it stored the KEY, "japanese". The engine compares by key
-- (lib/guides/guide-language sameGuideLanguage), so both priced correctly and
-- nothing was ever mispriced — which is exactly why it went unnoticed.
--
-- The operator found it from the outside: the calculator's language list is
-- built from the rate rows, and a table holding two spellings is a table that
-- can show one language twice. The two rows are NOT duplicates — Alexandria
-- throughout from one supplier, Cairo spot from another, both real — so this
-- changes how the language is SPELLED and deletes nothing.
--
-- The API write paths already slugify (app/api/rates/guides POST and [id] PUT,
-- since the vocabulary landed). The CSV importer did not, and is fixed in the
-- same change: an open-vocabulary column is slugified on import, the way an
-- enum column already normalised to its canonical spelling.
--
-- The CHECK is a SHAPE, not a list of languages. It does not decide which
-- languages an agency may sell — the vocabulary does that — only that whatever
-- it sells is stored the one way. A value list here is the mistake migration
-- 20261007 unpicked on suppliers; a shape is not.

BEGIN;

UPDATE public.guide_rates
SET guide_language = regexp_replace(
      regexp_replace(lower(btrim(guide_language)), '[^a-z0-9]+', '_', 'g'),
      '^_+|_+$', '', 'g')
WHERE guide_language IS NOT NULL
  AND guide_language <> regexp_replace(
      regexp_replace(lower(btrim(guide_language)), '[^a-z0-9]+', '_', 'g'),
      '^_+|_+$', '', 'g');

ALTER TABLE public.guide_rates
  DROP CONSTRAINT IF EXISTS guide_rates_language_key_shape;

ALTER TABLE public.guide_rates
  ADD CONSTRAINT guide_rates_language_key_shape
  CHECK (guide_language IS NULL OR guide_language ~ '^[a-z0-9][a-z0-9_]*$');

COMMENT ON COLUMN public.guide_rates.guide_language IS
  'A guide_language vocabulary KEY (Settings → Vocabulary), never the word. '
  'Rows written before 2026-09-17 held the word; migration 20261026 normalised '
  'them and the CHECK keeps it that way. Matched with '
  'lib/guides/guide-language sameGuideLanguage.';

COMMIT;
