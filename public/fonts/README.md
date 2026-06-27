# Bundled fonts

The PDF generators use **Noto Sans JP** as the base font for ALL locales
(it renders Latin perfectly too). jsPDF's built-in fonts
(helvetica/times/courier) are Latin-only — so any Japanese character (e.g. a
Japanese supplier/client name on an English voucher) would render as a hollow
box ("tofu") without this asset.

## What to drop in

Three files, all placed directly in `/public/fonts/`:

| File | Purpose | Required |
|---|---|---|
| `NotoSansJP-Regular.ttf` | normal-weight text | YES |
| `NotoSansJP-Bold.ttf` | **bold** headers/totals (static Bold weight — jsPDF can't synthesize faux-bold for embedded fonts, so a real Bold file is needed or all bold flattens) | YES |
| `OFL.txt` | SIL Open Font License (legally required to accompany the font; covers both weights) | YES |

The loaders ([`lib/pdf-fonts.ts`](../../lib/pdf-fonts.ts) for jsPDF,
[`lib/pdf-fonts-server.ts`](../../lib/pdf-fonts-server.ts) for puppeteer)
read both weights and throw a clear error if either is missing. Use the
**static** weights from the Google Fonts download's `static/` folder
(`NotoSansJP-Regular.ttf`, `NotoSansJP-Bold.ttf`) — NOT the variable font.

## Where to download

**Source: official Google Notofonts repository**, SIL OFL 1.1 licensed.

```
https://github.com/notofonts/noto-cjk/releases
```

Pick the latest release of "Noto Sans CJK" (or "Noto Sans JP"). Two
practical choices:

1. **Recommended — Noto Sans JP standalone, Regular weight, OTF/TTF
   bundle**: download `Sans/OTF/Japanese/NotoSansJP-Regular.otf` or
   `Sans/TTF/Japanese/NotoSansJP-Regular.ttf` (~3–4 MB). This is the
   STANDARD JIS coverage you asked for — JIS X 0208 kanji + kana + Latin
   + standard punctuation/symbols. Save as
   `NotoSansJP-Regular.ttf`. (If you grab the OTF, rename to `.ttf`
   only if jsPDF accepts it — otherwise convert via `fonttools` /
   `otf2ttf`.)

2. **Alternative — Google Fonts download** at
   `https://fonts.google.com/noto/specimen/Noto+Sans+JP` → "Get font" →
   "Download all" zip. Inside the zip: `static/NotoSansJP-Regular.ttf`.
   Same coverage, just a different distribution channel.

**Do NOT** use a "minimal common characters" subset. The content is
Egyptian tourism in Japanese — place names, traveler katakana, and the
occasional uncommon kanji in a name. A minimal subset will render a box
for the one rare character and that's a silent production failure we
can't predict per-itinerary. Standard JIS coverage eliminates the class.

## License file

Same release on GitHub ships an `LICENSE` or `OFL.txt` at the repo root.
Copy it here as `OFL.txt`. From Google Fonts the zip includes
`OFL.txt` in the root. Either source is fine — both are the unchanged
SIL OFL 1.1 text.

## Verify after dropping in

```
$ ls -la public/fonts/
NotoSansJP-Regular.ttf      ~3-5 MB
OFL.txt                     ~4 KB
README.md                   (this file)
```

The PDF generators then automatically pick the font up when locale='ja'.
A render with Japanese content should produce visible CJK glyphs; if it
still shows boxes, the asset is missing/corrupt or the path is wrong.
