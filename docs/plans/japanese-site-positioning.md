# 日本語サイト — ポジショニング設計

Working document for the Japanese marketing site. **Not copy** — this is the
argument the copy has to make, section by section, so that whoever writes the
Japanese prose (and whoever reviews it) is arguing for the same thing.

Decisions taken with the operator, 2026-08-27.

---

## Who this page is for

Japanese travel companies **buying the software to run their own business** —
not partners buying trips. That is a different reader from the English page's,
and the page should be written for them rather than translated at them.

They are evaluating a foreign SaaS vendor. Assume they are asking, in roughly
this order:

1. Does this understand my actual work, or is it generic?
2. Is it real — who else uses it?
3. What happens to my customers' personal data?
4. Who is behind this, and can I reach them in Japanese?
5. What does it cost?

The English page answers (1) well and the rest barely at all. That is the gap
to close, and most of it is **new content, not translation**.

---

## Positioning: Middle East / Africa specialist, proven on Egypt

Chosen over "Egypt specialist" (too narrow for the prospect list) and "general
travel operations" (competes head-on with established Japanese systems).

**The honesty constraint.** Every city in the rate data today is Egyptian —
Cairo, Luxor, Giza, Aswan, Alexandria, Minya, Edfu, Hurghada, Marsa Alam,
Sharm El Sheikh, Dakhla, Fayoum, St Catherine, Kharga. There is no Jordan or
Morocco rate card. The software is destination-agnostic; the *content* is not.

So the page must say plainly: **エジプトは初日から完全に使える。他の目的地は設定して使う。**
The English page already does this (Egypt "Complete", others "Configurable")
and the Japanese one must not soften it. A prospect who discovers the gap after
signing is a refund and a bad reference.

---

## Section order

Japanese SME software evaluation runs closer to *understand → trust → price →
contact* than the English *hook → features → demo*. Structure accordingly.

### 1. 冒頭 — what it is, in one breath
Must land: this is an operations system for outbound travel companies working
the Middle East and Africa, built by people who run that business.

Avoid the English page's punchy register ("Turn a message into a fully-priced
tour"). It translates as glib. State the work it does.

### 2. こんな業務の課題に (the problem)
Three concrete scenes from their day, not ours. The English page's scenarios are
good raw material but are written from an Egypt DMC's chair — rewrite from a
Japanese outbound agency's: 見積作成に時間がかかる, 仕入れ値の変更に追いつかない,
利益が出発後にしか分からない.

### 3. 主な機能 (what it does)
Group by the job, not the module. Suggested order — the first two are the ones
a Japanese agency feels immediately:

- 見積・原価計算 — rate periods, per-night pricing, dual passport rates
- お客様ポータル — the traveller-facing side (see §4, it deserves its own)
- 手配・予約管理 — bookings, suppliers, confirmations
- 請求・入金・収支 — invoices, payments, per-trip P&L
- AI 支援 — WhatsApp parsing, itinerary drafting. **Place last.** Japanese SME
  buyers discount AI claims; leading with it costs credibility that the
  operational depth would have earned.

### 4. お客様ポータル — give it its own section
This is the strongest differentiator for this audience and it is currently
absent from the site in any language.

Must land: 参加申込書 that the customer fills in themselves, on their phone, in
Japanese. Passport photographed and attached. Questions answered in-app. The
agency stops chasing paper.

Say that the portal is already Japanese — it is, and that matters more to this
reader than any feature bullet.

### 5. セキュリティと個人情報の取扱い — non-negotiable, and an advantage
This is where a foreign vendor normally loses a Japanese deal, and where you
happen to be strong. State concretely:

- パスポート画像は非公開ストレージに保管（URLでは開けない）
- 閲覧は権限を持つ担当者のみ、リンクは5分で失効
- 旅行終了後に自動削除（保持期間は予約日程から確定し、後から延びない）
- 操作履歴を記録

Written plainly, this reads as a company that has thought about 個人情報, which
is the point. Do not bury it in a feature grid.

### 6. 導入事例・実績 (proof)
**Blocked on the operator.** The current English testimonials are anonymous
("Operations Manager, Regional Tour Operator"). In Japan an unnamed testimonial
reads as fabricated and costs more trust than it earns.

Either name a company with permission, or cut the section and prove it another
way — screenshots of real work, number of bookings handled, years in operation.

### 7. 料金 (pricing) — tiers
Operator has chosen to publish tiers. **Numbers still to be set.** Structure to
leave room for:

- three tiers by team size or booking volume
- what is included at each
- 初期費用 and 最低契約期間 stated, not hidden — Japanese buyers ask early and
  a vague answer reads as a trap

### 8. 会社概要・サポート (who you are)
Japanese buyers check this properly. Assets you already have and do not mention:

- 東京・大阪オフィス（月〜金 9:00–17:00）— Japanese-hours support from a
  Japanese-speaking team is a serious answer to "what if something breaks"
- Cairo office 日〜木 — the operational end, on the ground
- 30+ years in tourism (already claimed on the English page)

### 9. 問い合わせ
Demo request, plus a plain email address. A form-only contact is a friction
point for this audience.

---

## What this is NOT

- Not a translation of `app/page.tsx`. Shares the product facts; different
  argument, different order, different register.
- Not a place to repeat the English page's numbers without re-checking them.
  They were all stale as of 2026-08-27 (see the accuracy pass) — re-derive
  before quoting.

## Open decisions blocking the copy

1. **Pricing tiers** — the actual numbers and what each includes
2. **導入事例** — a nameable customer, or cut the section
3. Whether to publish 初期費用 / 最低契約期間

## Sequencing

1. This outline, agreed
2. Japanese draft, section by section
3. Japanese staff review — **rework for naturalness, not proofread**
4. `/ja/` routing + SEO tags (no locale in the URL today; a cookie-switched
   translation is invisible to search, which defeats the purpose)
5. Docs: portal family first, then getting-started and pricing pages
