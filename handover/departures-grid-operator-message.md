# Departures grid — operator message (JP + EN)

Message to send the operator (ATS Japan) to confirm the departures grid before
switching it on. Four questions; their answers unblock the prod migration and
finalise two provisional decisions.

- **Attachment to include:** the design render `departures-grid-preview.html`
  (export to PDF or screenshot; sample numbers, not live data).
- **Answer → code (all pre-isolated):** Q2 → `allocateBand`, Q3 → `resolveFx`,
  Q4 → `flight_class` (per-departure column today; per-leg means moving it onto
  the itinerary legs). Q1 gates whether we proceed. See
  `handover/feature-specs/6-departures-grid-spec.md`.
- **Status:** built end-to-end; migration `20261030` applied to E2E only, NOT
  prod. Prod apply waits on Q1–Q4.

---

## 日本語（正式版）

**件名：出発日別 料金グリッドのご確認のお願い（4点）**

○○様

いつも大変お世話になっております。[your name]でございます。

先日お見せいただきました出発日別の料金表（Excel）につきまして、同じ形のものをシステム上で作成いたしました。現在の運用を踏まえつつ、より正確かつ効率的にご利用いただける形を目指しております。

**概要：**
ツアーごとに、出発日を縦軸に並べ、横軸には現在お使いの4項目——**AIR（航空）／燃油／LND（ランド）／合計**——を、お一人様あたり・日本円で表示いたします。イメージ図を添付しておりますので、ご確認ください（数値はサンプルであり、実データではございません）。

**現行の手作業の料金表との違い：**
現在はLND（ランド料金）を全出発日に同一の金額で入力されているかと存じますが、本システムはホテル・クルーズの季節料金および各航空券のシーズンを把握しているため、**出発日ごとにその日の料金で自動計算**いたします。たとえば7月出発分と1月出発分が、同一ではなく正しく異なる金額として算出されます。燃油につきましては従来通り手入力の一項目として残しており、この点の運用は変わりません。その他の項目は自動計算され、内容の編集およびExcelへの書き出しも可能です。

導入の準備は整っておりますが、実際の運用に即した設定とするため、以下の4点についてご確認をお願いできますでしょうか。

**1．この形式で問題ございませんでしょうか。**
出発日を縦軸に、AIR／燃油／LND／合計を横軸に、お一人様あたり・グロス・日本円での表示——この形でよろしいでしょうか。あるいは、事務所で別途お使いの表示形式がございましたら、それに合わせて作成いたします。

**2．国内線（例：カイロ〜アスワン）はどの列に含めるべきでしょうか。**
LNDには国内線を含めないとのお話でしたが、国内線は国際線（往復）と合わせて**AIR列**に含めるべきか、あるいは別途分けて表示すべきか、ご教示ください。現状は、航空はすべてAIR、地上手配はすべてLNDとして扱っております。

**3．グリッドで使用する為替レートと、変更の要否についてご確認ください。**
現在は**1米ドル＝160円**（社内レートとして伺った数値）で設定しております。ファイル上には157.15円という数値もございました。160円で固定とするか、あるいは事務所側でシーズンごとに変更できる入力欄を設けるか、ご希望をお聞かせください。

**4．搭乗クラスは「出発日ごと」に1つで問題ございませんでしょうか。**
搭乗クラス（エコノミー、ビジネス等）を記録できるようにしておりますが、これは**出発日ごとに1つ**で足りますでしょうか。それとも、**区間（レグ）ごと**にクラスが異なる場合があり、区間別に記録する必要がございますでしょうか。

以上4点についてご回答いただけましたら、正式に運用を開始いたします。ご不明な点等ございましたら、オンラインにて画面を共有しながらご説明することも可能でございますので、お気軽にお申し付けください。

何卒よろしくお願い申し上げます。

[your name]

---

## English (formal)

**Subject: Request for confirmation — Departure-date pricing grid (4 points)**

Dear [name],

Thank you as always for your continued support.

Following the departure-date pricing sheet (Excel) you kindly showed me, I have created an equivalent within the system. My aim has been to preserve your current way of working while making it more accurate and more efficient.

**Overview:**
For each tour, departure dates run down the left, and across the top are the four columns you already use — **AIR (航空) / Fuel (燃油) / LND (ランド) / Total (合計)** — shown per person, in Japanese yen. I have attached an image for your reference (the figures are samples, not live data).

**How this differs from the manual sheet:**
At present, I understand LND is entered as a single flat figure across every departure date. Because the system holds the seasonal rates for hotels and cruises, as well as the fare season of each flight, it **prices every departure at its own date automatically**. For example, a July departure and a January departure are calculated as correctly different amounts rather than the same. Fuel remains a single manually entered item exactly as before — nothing changes there. Everything else is calculated automatically, and the results can be edited and exported to Excel.

The feature is ready to switch on. To set it up in line with how the office actually works, may I ask you to confirm the following four points?

**1. Is this format acceptable?**
Departure dates down the side; AIR / Fuel / LND / Total across the top; per person, gross, in yen — is this the view you want? If the office uses a different layout, I will match it instead.

**2. Which column should domestic flights (e.g. Cairo–Aswan) belong to?**
You mentioned that LND excludes domestic air. Should domestic flights be included in the **AIR** column together with the international round-trip, or shown separately? At present, all air travel is placed in AIR and all ground arrangements in LND.

**3. Which exchange rate should the grid use, and should it be adjustable?**
It is currently set to **160 JPY per USD** (the internal rate you mentioned). The file also showed 157.15. Would you like 160 fixed, or a field where the office can change the rate by season?

**4. Is a single flight class "per departure" sufficient?**
The system can record the flight class (economy, business, etc.). Is **one value per departure** enough, or do classes sometimes differ **by leg (segment)**, so that they need to be recorded per leg?

Once I have your answers to these four points, I will bring the feature into service. If it would be easier, I would be glad to walk you through the screen on a short online call.

Thank you very much for your kind attention.

Best regards,
[your name]
