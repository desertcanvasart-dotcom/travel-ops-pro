// ============================================
// Japanese message templates — customer and internal
// ============================================
// Hand-written. Each entry is the Japanese twin of the English template with
// the same `name` and `channel` (see message-templates.en.json). Every
// {{Placeholder}} must match the English twin exactly — the generator
// (scripts/build-message-templates-ja.mjs) and the parity test refuse a drift.
//
// Tone: customer-facing mail in polite business Japanese (です・ます, 〜様);
// WhatsApp/LINE-style messages lighter but still polite; internal notes plain.
// Emoji and *WhatsApp bold* kept where the English has them.
// Operator decision 2026-08-22: supplier / partner / B2B stay English.
// ============================================

export const JA_TEMPLATES = [
  // ─────────────────────────── customer ───────────────────────────
  {
    name: 'Booking Confirmation', channel: 'whatsapp',
    description: 'ご予約確定のご連絡（WhatsApp／LINE用・短文）。',
    subject: '',
    body: `ご予約が確定しました ✅

予約番号: {{BookingRef}}
旅行: {{TripName}} | {{TripDates}}
人数: {{PaxCount}}名 | 送迎: {{PickupTime}} {{PickupPoint}}にて

ご旅行中の現地オペレーション担当:
{{OpsManagerName}} – {{OpsManagerPhone}}（24時間対応）

ご到着が近づきましたら、バウチャー一式と日毎のスケジュールをお送りいたします。

{{AgentName}}`,
  },
  {
    name: 'Booking Confirmation', channel: 'email',
    description: 'ご予約確定のご案内メール。予約内容・お支払い状況・今後の流れをまとめてお伝えします。',
    subject: 'ご予約確定のお知らせ — {{TourName}}（予約番号: {{BookingRef}}）',
    body: `{{GuestName}} 様

このたびはエジプト旅行のご予約が確定いたしましたので、ご案内申し上げます。

■ ご予約内容
・予約番号: {{BookingRef}}
・ツアー: {{TourName}}
・日程: {{TripDates}}（{{Duration}}日間）
・人数: {{PaxCount}}名
・サービスクラス: {{ServiceLevel}}

■ お支払い状況
・旅行代金合計: {{Currency}} {{TotalPrice}}
・お預かり済み（お申込金）: {{Currency}} {{DepositAmount}}
・残金: {{Currency}} {{BalanceDue}}（お支払期限: {{BalanceDueDate}}）

■ 今後の流れ
1. 48時間以内に、ホテル・ガイド・車両など各手配先の確認を完了いたします
2. ご出発の7日前に、詳細な旅行のしおりをお送りいたします
3. ご到着の3日前に、ガイドの連絡先をお知らせいたします

お食事のご要望、歩行のご不安、記念日のお祝いなど、特別なご希望がございましたら、準備の都合上、今のうちにお知らせいただけますと幸いです。

エジプトでお迎えできる日を、スタッフ一同心よりお待ちしております。

{{AgentName}}
{{CompanyName}}
{{CompanyPhone}}`,
  },
  {
    name: 'Booking Confirmation (WhatsApp)', channel: 'whatsapp',
    description: 'ご予約確定のご連絡（WhatsApp／LINE用）。今後の流れを3ステップでお伝えします。',
    subject: '',
    body: `{{GuestName}} 様 🎉

ご予約が *確定* いたしました！

✅ *{{TourName}}*
📅 {{TripDates}}
👥 {{PaxCount}}名
🔖 予約番号: {{BookingRef}}

*今後の流れ:*
1️⃣ 48時間以内に各手配先を確認
2️⃣ ご出発7日前に旅行のしおりをお送り
3️⃣ ご到着3日前にガイドの連絡先をお知らせ

特別なご希望がございましたら、今のうちにお知らせください 🙏

{{AgentName}} — {{CompanyName}}`,
  },
  {
    name: 'Deposit Received', channel: 'email',
    description: 'お申込金のご入金確認メール。残金とお支払期限をご案内します。',
    subject: 'お申込金のご入金を確認いたしました — {{BookingRef}}',
    body: `{{GuestName}} 様

{{TourName}}のお申込金 {{Currency}} {{DepositAmount}} のご入金を確認いたしました。ありがとうございます。

■ お支払い内容
・予約番号: {{BookingRef}}
・お申込金（受領済み）: {{Currency}} {{DepositAmount}}
・残金: {{Currency}} {{BalanceDue}}
・残金お支払期限: {{BalanceDueDate}}

領収書を添付いたしましたので、お手元に保管ください。

現在、各手配先との確認を進めております。まもなく正式な予約確定のご案内をお送りいたします。

{{AgentName}}
{{CompanyName}}`,
  },
  {
    name: 'Deposit Request', channel: 'whatsapp',
    description: 'お申込金のお支払いのお願い（WhatsApp／LINE用）。',
    subject: '',
    body: `{{GuestName}} 様、ご連絡です。{{TripDates}}のガイドと車両を確保するため、お申込金のお手続きをお願いいたします。

・お申込金: {{DepositAmount}} {{Currency}}
・お支払期限: {{DepositDeadline}}
・お支払いリンク: {{PaymentLink}}

ご入金が確認でき次第、{{GuestName}} 様のお名前で全ての手配を確定いたします。

{{AgentName}}`,
  },
  {
    name: 'Final Payment Reminder', channel: 'email',
    description: '残金のお支払期限のご案内メール。',
    subject: '残金お支払いのご案内 — {{BookingRef}}',
    body: `{{GuestName}} 様

ご旅行の残金のお支払期限が {{BalanceDueDate}} となっておりますので、ご案内申し上げます。

■ お支払い内容
・予約: {{BookingRef}} — {{TourName}}
・旅行日程: {{TripDates}}
・残金: {{Currency}} {{BalanceDue}}

{{PaymentInstructions}}

ご入金を確認でき次第、詳細な日程表・ホテルバウチャー・ガイドの連絡先を含む旅行書類一式をお送りいたします。

お支払いについてご不明な点がございましたら、お気軽にお問い合わせください。

{{AgentName}}
{{CompanyName}}`,
  },
  {
    name: 'Follow-Up After Quote', channel: 'email',
    description: 'お見積り送付後のフォローメール。ご検討状況の確認と修正のご提案。',
    subject: 'エジプト旅行のご検討状況について — {{BookingRef}}',
    body: `{{GuestName}} 様

先日お送りいたしました{{TourName}}の旅程案につきまして、ご検討状況をお伺いしたくご連絡いたしました。

ご旅行の計画にはお時間がかかるものと存じますので、どうぞごゆっくりご検討ください。ご不明な点や、日程・ホテルのグレード・観光内容・ご予算など、調整をご希望の箇所がございましたらお知らせください。

ご納得いただけるまで、追加費用なしで何度でも旅程を見直しいたします。

ご連絡をお待ちしております。

{{AgentName}}
{{CompanyName}}`,
  },
  {
    name: 'Follow-Up After Quote (WhatsApp)', channel: 'whatsapp',
    description: 'お見積り送付後の軽いフォロー（WhatsApp／LINE用）。',
    subject: '',
    body: `{{GuestName}} 様 😊

{{TourName}}の旅程案はご覧いただけましたでしょうか？

ご質問や変更のご希望がございましたら、どうぞお気軽にお知らせください。急がせるつもりは全くございませんので、ご安心ください！

{{AgentName}}`,
  },
  {
    name: 'Full Payment Received', channel: 'email',
    description: '全額ご入金確認メール。旅行書類の送付時期をご案内します。',
    subject: 'ご入金完了のお知らせ — {{BookingRef}}',
    body: `{{GuestName}} 様

{{TourName}}の旅行代金全額のご入金を確認いたしました。これで全てのお手続きが完了です。

■ 確定済みのご予約
・予約番号: {{BookingRef}}
・日程: {{TripDates}}
・お支払い済み合計: {{Currency}} {{TotalPrice}}

領収書を添付いたしましたので、お手元に保管ください。

詳細な日程表・ホテルバウチャー・緊急連絡先を含む旅行書類一式は、ご出発の7日前にお送りいたします。

エジプトでお会いできる日を楽しみにしております。

{{AgentName}}
{{CompanyName}}`,
  },
  {
    name: 'Guide Introduction', channel: 'email',
    description: '担当ガイドのご紹介メール。',
    subject: '{{TourName}}の担当ガイドのご紹介',
    body: `{{GuestName}} 様

ご旅行中に{{GuestName}} 様を担当いたしますガイド、{{GuideName}}をご紹介いたします。

■ 担当ガイド
・氏名: {{GuideName}}
・対応言語: {{GuideLanguages}}
・電話番号: {{GuidePhone}}

{{GuideName}}は当社でも特に経験豊富なガイドで、ご旅行の間ずっとご一緒いたします。ご到着後にご用の際は、直接ご連絡いただいて構いません。

ガイドは {{StartDate}} に {{MeetingPoint}} でお待ちしております。

素晴らしいご旅行となりますよう、お祈りしております。

{{AgentName}}
{{CompanyName}}`,
  },
  {
    name: 'Guide Introduction (WhatsApp)', channel: 'whatsapp',
    description: '担当ガイドのご紹介（WhatsApp／LINE用）。',
    subject: '',
    body: `{{GuestName}} 様 👋

{{TourName}}の担当ガイドをご紹介します！

🧑‍🏫 *{{GuideName}}*
📱 {{GuidePhone}}
🗣️ {{GuideLanguages}}

{{GuideName}}が {{StartDate}} に {{MeetingPoint}} でお待ちしています。

ご到着後にご用の際は、直接ご連絡いただいて大丈夫です。

素敵なご旅行を！ 🎉

{{AgentName}}`,
  },
  {
    name: 'Itinerary Change (WhatsApp)', channel: 'whatsapp',
    description: '旅程の小さな変更のご連絡（WhatsApp／LINE用）。',
    subject: '',
    body: `{{GuestName}} 様 👋

{{TourName}}のご旅程について、ご連絡です。

📝 *変更内容:* {{ChangeDescription}}
📌 *理由:* {{ChangeReason}}

その他の内容に変更はございません。更新した日程表をメールでお送りしました。

ご不明な点がございましたら、お気軽にお知らせください 🙏

{{AgentName}}`,
  },
  {
    name: 'Itinerary Change Notification', channel: 'email',
    description: '旅程変更のご案内メール。変更内容と理由をご説明します。',
    subject: 'ご旅程の変更についてのご案内 — {{BookingRef}}',
    body: `{{GuestName}} 様

{{TourName}}のご旅程につきまして、一部変更がございますのでご案内申し上げます。

■ 変更内容
{{ChangeDescription}}

■ 変更の理由
{{ChangeReason}}

この変更によりご旅行の内容や品質が損なわれることはなく、新しい手配もきっとお楽しみいただけるものと存じます。

その他の手配に変更はございません。更新した日程表を添付いたします。

ご不明な点やご心配な点がございましたら、どうぞお気軽にお問い合わせください。

{{AgentName}}
{{CompanyName}}
{{CompanyPhone}}`,
  },
  {
    name: 'Lead Response & Preferences', channel: 'whatsapp',
    description: '初回お問い合わせへの返信と、ご希望のヒアリング（WhatsApp／LINE用）。',
    subject: '',
    body: `{{GuestName}} 様 👋
お問い合わせありがとうございます！ご希望に合わせたエジプト旅行のプランをお作りいたします。

最適なホテル・ガイド・ペース配分をご提案するため、いくつかお伺いさせてください:

1. 日程: {{TripDates}}（変更の余地はありますか？）
2. 人数: {{PaxCount}}名（大人／お子様の年齢）
3. 旅のスタイル: クラシック／ラグジュアリー／アドベンチャー／ファミリー／ウェルネス
4. 必ず訪れたい場所: ピラミッド、ルクソール、アブシンベルなど
5. ホテルのグレード: 4つ星／5つ星／ブティック／ラグジュアリー
6. 特別なご希望: お食事、歩行のご不安、記念日のお祝いなど

お伺いでき次第、分かりやすい旅程・含まれる内容・料金内訳をお送りいたします。

{{AgentName}} | {{CompanyName}}`,
  },
  {
    name: 'Mid-Trip Check-in', channel: 'whatsapp',
    description: 'ご旅行中の様子伺い（WhatsApp／LINE用）。翌日のペース調整をご提案します。',
    subject: '',
    body: `{{GuestName}} 様、本日は{{GuideName}}とのご観光はいかがでしたでしょうか？

ご希望があれば、明日のペースを調整いたします:
・出発時間を早める／遅らせる
・昼食の時間を長めに取る
・各見学地での自由時間を増やす
・どこかを省いてゆっくり過ごす

お気軽にお知らせください！

{{AgentName}}`,
  },
  {
    name: 'Payment Reminder (WhatsApp)', channel: 'whatsapp',
    description: '残金お支払いのご案内（WhatsApp／LINE用）。',
    subject: '',
    body: `{{GuestName}} 様 👋

{{TourName}}の残金のお支払期限が {{BalanceDueDate}} となっておりますので、ご案内いたします。

💰 残金: {{Currency}} {{BalanceDue}}
📅 お支払期限: {{BalanceDueDate}}

ご入金を確認でき次第、日程表・バウチャー・ガイド情報を含む旅行書類一式をお送りいたします。

ご不明な点があれば、いつでもご連絡ください 😊

{{AgentName}}`,
  },
  {
    name: 'Post-Trip Thank You', channel: 'whatsapp',
    description: 'ご帰国後のお礼とレビューのお願い（WhatsApp／LINE用）。',
    subject: '',
    body: `{{GuestName}} 様、おかえりなさいませ！ 🏠

このたびは当社をご利用いただき、誠にありがとうございました。エジプトがご期待どおりの旅となっていましたら幸いです。

もし1分ほどお時間をいただけましたら、レビューをお寄せいただけると大変励みになります:
{{ReviewLink}}

また、ご旅行で一番印象に残った瞬間を教えていただけましたら、次回のご旅行に向けたおすすめプラン（ヨルダン？モロッコ？トルコ？）をご提案いたします。

本当にありがとうございました！
{{AgentName}} | {{CompanyName}}`,
  },
  {
    name: 'Pre-Trip Info (WhatsApp)', channel: 'whatsapp',
    description: 'ご出発7日前の要点まとめ（WhatsApp／LINE用）。',
    subject: '',
    body: `{{GuestName}} 様 ✈️

ご出発まであと7日となりました！大切なポイントをお知らせします:

🧑‍✈️ *担当ガイド*
{{GuideName}} — {{GuidePhone}}

📍 *ご到着*
{{StartDate}} カイロ国際空港（CAI）
当社スタッフがお名前のボードを持って到着ロビーでお迎えします

🌡️ *気候:* 25〜35℃ — 薄手の重ね着と日焼け止めをご用意ください
💵 *通貨:* エジプトポンド。ホテルでは米ドル・ユーロも利用可
🛂 *ビザ:* 到着時に取得可能（約25米ドル）

📋 旅行のしおり一式をメールでお送りしました！

それでは、まもなくお会いしましょう！ 🇪🇬

{{AgentName}} — {{CompanyName}}
📞 {{CompanyPhone}}`,
  },
  {
    name: 'Pre-Trip Information Pack', channel: 'email',
    description: 'ご出発7日前の旅行のしおりメール。到着・ガイド・現地情報・持ち物・緊急連絡先。',
    subject: 'ご出発まであと7日！ご旅行に必要な情報のご案内 — {{BookingRef}}',
    body: `{{GuestName}} 様

エジプトへのご出発まで、あと7日となりました。ご旅行に必要な情報をまとめてご案内いたします。

■ ご到着について
・日付: {{StartDate}}
・空港: カイロ国際空港（CAI）
・当社スタッフがお名前を記したボードを持って到着ロビーでお迎えいたします

■ 担当ガイド
・氏名: {{GuideName}}
・電話番号: {{GuidePhone}}
・対応言語: {{GuideLanguages}}

■ 現地の基本情報
・気候: 25〜35℃が見込まれます。薄手の重ね着と日焼け対策をおすすめします
・通貨: エジプトポンド（EGP）。ホテルでは米ドル・ユーロも広く利用できます。ATMは各所にあります
・ビザ: 多くの国籍の方は到着時に取得できます（約25米ドル）
・服装: 神殿やモスクの見学では、肩と膝が隠れる控えめな服装をおすすめします
・チップ: 現地の習慣です。適切な金額はガイドがご案内いたします

■ 持ち物
・歩きやすい靴
・帽子とサングラス
・日焼け止め（SPF50以上）
・モスク見学用の薄手のスカーフ
・カメラと予備のメモリーカード
・電源変換プラグ（Cタイプ、ヨーロッパ式2ピン）

詳細な日毎の日程表を添付いたします。

■ 緊急連絡先
・24時間対応オペレーション: {{CompanyPhone}}
・担当ガイド: {{GuidePhone}}
・現地緊急番号: 122（警察）、123（救急）

素晴らしいご旅行となりますよう、お祈りしております。

{{AgentName}}
{{CompanyName}}`,
  },
  {
    name: 'Quotation (WhatsApp)', channel: 'whatsapp',
    description: '旅程案・お見積りのご連絡（WhatsApp／LINE用）。',
    subject: '',
    body: `{{GuestName}} 様 👋

{{TourName}}の旅程案が完成しました！

📋 *旅行概要*
📅 {{TripDates}}（{{Duration}}日間）
👥 {{PaxCount}}名
⭐ {{ServiceLevel}}
💰 {{Currency}} {{TotalPrice}}

日毎の詳細な日程表はメールでお送りしました。

このお見積りの有効期限は7日間です。ご予約の確定には、お申込金 {{DepositAmount}} が必要となります。

変更のご希望がございましたら、お気軽にお知らせください。喜んで調整いたします 😊

{{AgentName}} — {{CompanyName}}`,
  },
  {
    name: 'Quotation Email', channel: 'email',
    description: '旅程案・お見積りの送付メール。概要・含まれるもの・含まれないもの・有効期限。',
    subject: 'オーダーメイド旅程のご提案 — {{TourName}} | 予約番号: {{BookingRef}}',
    body: `{{GuestName}} 様

{{TourName}}の旅程案を添付にてお送りいたします。

■ 旅行概要
・日程: {{TripDates}}（{{Duration}}日間）
・人数: {{PaxCount}}名
・サービスクラス: {{ServiceLevel}}
・旅行代金合計: {{Currency}} {{TotalPrice}}

日程表には、日毎の観光内容、ホテルの詳細、移動の手配、および全ての入場料を記載しております。

■ 料金に含まれるもの
{{Inclusions}}

■ 料金に含まれないもの
{{Exclusions}}

このお見積りの有効期限は7日間です。ご予約の確定には、お申込金 {{DepositAmount}} が必要となります。

変更のご希望がございましたら、どうぞお気軽にお申し付けください。ご希望に沿うよう喜んで旅程を調整いたします。

{{AgentName}}
{{CompanyName}}
{{CompanyPhone}}`,
  },
  {
    name: 'Quote Expiry Reminder', channel: 'email',
    description: 'お見積り有効期限（3日前）のご案内メール。',
    subject: 'お見積りの有効期限が近づいております — {{BookingRef}}',
    body: `{{GuestName}} 様

{{TourName}}のお見積り（予約番号: {{BookingRef}}）の有効期限が3日後に迫っておりますので、ご案内申し上げます。

■ ご提案内容（概要）
・日程: {{TripDates}}
・人数: {{PaxCount}}名
・合計: {{Currency}} {{TotalPrice}}

有効期限を過ぎますと、ホテルの空室状況や季節料金の変動により、料金が変わる場合がございます。

現在の料金でご予約を確保するには、お申込金 {{DepositAmount}} のみで結構です。残金につきましては、柔軟なお支払い条件をご相談いただけます。

ご検討にもう少しお時間が必要な場合や、ご質問がございましたら、このメールにご返信ください。

{{AgentName}}
{{CompanyName}}`,
  },
  {
    name: 'Referral Request', channel: 'email',
    description: 'ご帰国後のご紹介のお願いメール。',
    subject: 'エジプト旅行をご検討中のお知り合いはいらっしゃいませんか？',
    body: `{{GuestName}} 様

{{TourName}}のご旅行の思い出が、まだ鮮やかに残っていることと存じます。

当社のお客様の多くは、ご旅行いただいた方からのご紹介でお越しになります。ご友人・ご家族・ご同僚の中にエジプト旅行をご検討中の方がいらっしゃいましたら、{{GuestName}} 様のご体験をお話しいただけますと大変光栄です。

ご紹介の方は、{{CompanyPhone}} または {{CompanyEmail}} まで直接ご連絡いただけます。{{GuestName}} 様のご旅行と同じように、心を込めて手配いたします。

ご紹介のお礼として、次回のご旅行に特別割引をご用意しております。

{{AgentName}}
{{CompanyName}}`,
  },
  {
    name: 'Thank You (WhatsApp)', channel: 'whatsapp',
    description: 'ご帰国後のお礼とレビューのお願い（WhatsApp／LINE用）。',
    subject: '',
    body: `{{GuestName}} 様 😊

おかえりなさいませ！エジプトでのひとときをお楽しみいただけましたでしょうか 🇪🇬

{{TourName}}のご旅行をお手伝いできましたこと、大変嬉しく思います。ご感想をぜひお聞かせください！

もしお時間がございましたら、簡単なレビューをいただけると何よりの励みになります:
{{ReviewLink}}

{{CompanyName}}をお選びいただき、ありがとうございました。またお会いできる日を楽しみにしております 🙏

{{AgentName}}`,
  },
  {
    name: 'Thank You / Review Request', channel: 'email',
    description: 'ご帰国後のお礼・ご感想とレビューのお願いメール。',
    subject: 'ご旅行ありがとうございました — {{GuestName}} 様',
    body: `{{GuestName}} 様

おかえりなさいませ。エジプトでのご旅行が、忘れられないひとときとなっていましたら幸いです。

{{TourName}}（{{TripDates}}）のご旅行をお手伝いできましたこと、心より嬉しく思います。ご旅行のハイライトや、お気づきの点がございましたら、ぜひお聞かせください。

■ ご感想のお願い
もしお時間がございましたら、レビューをお寄せいただけますと幸いです。いただいたご感想は、当社のサービス向上と、これから旅行を計画される方々の参考になります:

{{ReviewLink}}

お写真を共有してくださる場合は、（ご許可のうえで）当社のチャンネルでご紹介させていただければ嬉しく存じます。

{{CompanyName}}をお選びいただき、誠にありがとうございました。またお会いできる日を楽しみにしております。

{{AgentName}}
{{CompanyName}}`,
  },
  {
    name: "Tomorrow's Plan", channel: 'whatsapp',
    description: '翌日のスケジュールのご連絡（WhatsApp／LINE用）。',
    subject: '',
    body: `{{GuestName}} 様、**明日（{{Date}}）**のご予定をお知らせします:

・お迎え: {{PickupTime}} {{PickupPoint}}にて
・ガイド: {{GuideName}}（{{GuidePhone}}）
・ドライバー: {{DriverName}}（{{DriverPhone}}）| {{VehicleType}} {{PlateNo}}
・スケジュール: 終日 ピラミッド・スフィンクス・エジプト考古学博物館
・お持ち物: 歩きやすい靴、日焼け止め、カメラ、お水

今夜、変更がございましたら {{OpsManagerPhone}} までいつでもご連絡ください。

明日が素晴らしい一日になりますように！ 🇪🇬`,
  },
  {
    name: 'Travel Documents Sent', channel: 'email',
    description: '旅行書類一式の送付メール。',
    subject: '旅行書類一式をお送りいたします — {{BookingRef}}',
    body: `{{GuestName}} 様

ご旅行に必要な書類一式を、このメールに添付してお送りいたします。

■ 添付書類
1. 日毎の詳細な日程表
2. ホテルバウチャー
3. 送迎・移動の確認書
4. 緊急連絡先カード

内容をご確認のうえ、{{StartDate}} のご出発前にご不明な点がございましたらお知らせください。

ご旅行中すぐにご覧いただけるよう、スマートフォンにも書類のコピーを保存されることをおすすめいたします。

{{AgentName}}
{{CompanyName}}
{{CompanyPhone}}`,
  },
  {
    name: 'Voucher Pack', channel: 'whatsapp',
    description: 'バウチャー一式のまとめ（WhatsApp／LINE用）。連絡先・到着・ホテル・ガイド・ドライバー。',
    subject: '',
    body: `**バウチャーパック**
予約番号: {{BookingRef}} | 日程: {{TripDates}}

**連絡先（24時間対応）**
オペレーション: {{OpsManagerName}} {{OpsManagerPhone}}
緊急時: {{Emergency24_7Phone}}

**空港ご到着**
日時: {{ArrivalDateTime}} | 便名: {{FlightNo}}
お迎え: 到着ロビー出口で「{{GuestName}}」のボードをお探しください
担当: {{GuideName}} {{GuidePhone}}

**ホテル**
カイロ: {{HotelName}} | {{RoomType}} | {{MealPlan}}
チェックイン: {{CheckInDate}} | チェックアウト: {{CheckOutDate}}

**担当ガイド**
{{GuideName}} | {{GuidePhone}}

**担当ドライバー**
{{DriverName}} | {{DriverPhone}} | {{VehicleType}}

日程表（全文）: {{ItineraryLink}}

素敵なご旅行を！ 🌟`,
  },
  {
    name: 'Weather / Safety Advisory', channel: 'email',
    description: '天候・安全に関する重要なご案内メール。',
    subject: 'ご旅行に関する重要なお知らせ — {{BookingRef}}',
    body: `{{GuestName}} 様

{{TripDates}}のご旅行に関しまして、重要なお知らせがございますのでご連絡いたします。

{{AdvisoryDetails}}

■ ご旅行への影響
{{TripImpact}}

■ 当社の対応
{{ActionsTaken}}

お客様の安全と快適さを最優先に考えております。ご心配な点がございましたら、どうぞご遠慮なくお問い合わせください。

{{AgentName}}
{{CompanyName}}
{{CompanyPhone}}`,
  },
  {
    name: 'Welcome / Inquiry Response', channel: 'email',
    description: '初回お問い合わせへの返信メール。受付内容の確認と、お見積りまでの目安。',
    subject: 'お問い合わせありがとうございます — {{TourName}}',
    body: `{{GuestName}} 様

このたびはエジプト旅行についてお問い合わせいただき、誠にありがとうございます。

お問い合わせ内容を承り、{{GuestName}} 様に合わせた旅程の作成を早速始めております。現時点で承っている内容は以下のとおりです:

・旅行日程: {{TripDates}}
・人数: {{PaxCount}}名
・ご希望の訪問先: {{Cities}}

日毎の観光内容、ホテルの候補、分かりやすい料金内訳を含む詳細なお見積りを、24時間以内にお送りいたします。

その間、追加のご希望やご質問がございましたら、このメールにご返信ください。

{{AgentName}}
{{CompanyName}}
{{CompanyPhone}}`,
  },
  {
    name: 'Welcome / Inquiry Response (WhatsApp)', channel: 'whatsapp',
    description: '初回お問い合わせへの返信（WhatsApp／LINE用）。',
    subject: '',
    body: `{{GuestName}} 様 👋

エジプト旅行にご興味をお持ちいただき、ありがとうございます！

ご希望を以下のとおり承りました:
📅 {{TripDates}}
👥 {{PaxCount}}名
📍 {{Cities}}

現在、{{GuestName}} 様に合わせた旅程を作成中です。24時間以内にお送りいたします。

追加のご希望がございましたら、お気軽にお知らせください！

{{AgentName}} — {{CompanyName}}`,
  },

  // ─────────────────────────── internal ───────────────────────────
  {
    name: 'Client Complaint Escalation', channel: 'email',
    description: 'お客様からの苦情のエスカレーション（社内向け）。',
    subject: '【エスカレーション】お客様苦情 — {{BookingRef}}',
    body: `エスカレーション — お客様からの苦情

予約: {{BookingRef}}
お客様: {{GuestName}}（{{GuestEmail}}、{{GuestPhone}}）
ツアー: {{TourName}}（{{TripDates}}）

■ 苦情の内容
{{ComplaintDescription}}

■ 影響を受けたサービス
{{AffectedServices}}

■ これまでの対応
{{ActionsTaken}}

■ 推奨する解決策
{{RecommendedResolution}}

■ 金銭的影響
{{FinancialImpact}}

マネジメントの判断が必要です。今後の対応についてご指示ください。

{{AgentName}}`,
  },
  {
    name: 'Daily Operations Brief', channel: 'email',
    description: '本日のオペレーション概要（社内向け）。',
    subject: '本日のオペレーション概要 — {{Date}}',
    body: `チームの皆さん、おはようございます。

本日のオペレーション概要です:

■ 本日の到着
{{ArrivalsToday}}

■ 本日の出発
{{DeparturesToday}}

■ 催行中のツアー
{{ActiveTrips}}

■ 確認待ちの手配
{{PendingConfirmations}}

■ 本日期限の支払い
{{PaymentsDue}}

■ 連絡事項・注意点
{{DailyNotes}}

今日も一日よろしくお願いします！
{{AgentName}}`,
  },
  {
    name: 'Incident Log', channel: 'email',
    description: 'インシデント記録（社内向け）。',
    subject: '',
    body: `**インシデント記録**

予約番号: {{BookingRef}}
お客様: {{GuestName}}
日時: {{DateTime}}

**発生した問題**
{{IssueDescription}}

**影響**
{{ImpactDescription}}

**実施した対応**
{{ActionTaken}}

**解決済み？** はい / いいえ / 対応中

**補償（ある場合）**
{{Compensation}}

**フォローアップ担当**
{{FollowupOwner}}

**お客様への連絡日時**
{{ClientUpdateTime}}

---
記録者: {{AgentName}}`,
  },
  {
    name: 'Internal Booking Handover', channel: 'email',
    description: '新規予約の社内引き継ぎメモ。',
    subject: '',
    body: `**新規予約 引き継ぎ**

予約番号: {{BookingRef}} | お客様: {{GuestName}} | 人数: {{PaxCount}}名 | 日程: {{TripDates}}

**主要サービス**
・空港: 到着・出発時のミート＆アシスト
・ホテル: {{HotelsSummary}}
・ツアー: {{ToursSummary}}
・移動: 全行程専用車

**金額**
・合計: {{TotalPrice}} {{Currency}}
・入金済み: {{PaidAmount}} | 残金: {{BalanceAmount}}
・残金期限: {{DepositDeadline}}

**お客様連絡先**
WhatsApp: {{ClientPhone}}
メール: {{ClientEmail}}

**オペレーション責任者**
{{OpsManagerName}} {{OpsManagerPhone}}

**備考・リスク**
{{SpecialRequests}}

---
引き継ぎ者: {{AgentName}}
日付: {{Date}}`,
  },
  {
    name: 'New Booking (WhatsApp)', channel: 'whatsapp',
    description: '新規予約確定の社内通知（WhatsApp／LINE用）。',
    subject: '',
    body: `✅ *新規予約が確定しました*

🔖 {{BookingRef}}
👤 {{GuestName}}（{{Nationality}}）
📅 {{TripDates}}
👥 {{PaxCount}}名
⭐ {{ServiceLevel}}
💰 {{Currency}} {{TotalPrice}}

次のステップ: 各手配先の確認 ＋ ガイドのアサイン

{{AgentName}}`,
  },
  {
    name: 'New Booking Notification', channel: 'email',
    description: '新規予約確定の社内通知メール。',
    subject: '新規予約確定 — {{BookingRef}}',
    body: `チーム各位

新規予約が確定しました:

・予約番号: {{BookingRef}}
・お客様: {{GuestName}}（{{Nationality}}）
・ツアー: {{TourName}}
・日程: {{TripDates}}（{{Duration}}日間）
・人数: {{PaxCount}}名
・サービスクラス: {{ServiceLevel}}
・金額: {{Currency}} {{TotalPrice}}

■ 次のステップ
1. ホテルと移動手段の確認
2. ガイドのアサイン
3. お客様への予約確定のご案内

担当: {{AgentName}}

良いツアーにしていきましょう！`,
  },
  {
    name: 'Post-Trip Debrief', channel: 'email',
    description: 'ツアー終了後の振り返り記録（社内向け）。',
    subject: '',
    body: `**ツアー終了後の振り返り**

予約番号: {{BookingRef}}
お客様: {{GuestName}}
日程: {{TripDates}}

**お客様満足度（1〜10）:** {{SatisfactionScore}}

**良かった点**
{{TripHighlights}}

**問題点**
{{TripIssues}}

**手配先の評価**
・ホテル: {{HotelRating}}/10
・ガイド: {{GuideRating}}/10
・移動: {{TransportRating}}/10

**追加提案の機会**
{{UpsellIdeas}}

**レビュー受領？** はい / いいえ
リンク: {{ReviewLink}}

---
記録者: {{AgentName}}
日付: {{Date}}`,
  },
  {
    name: 'Supplier Issue Alert', channel: 'email',
    description: '手配先トラブルの緊急アラート（社内向け）。',
    subject: '【緊急】手配先トラブル — {{BookingRef}}',
    body: `緊急 — 手配先トラブル

予約: {{BookingRef}} — {{GuestName}}（{{TripDates}}）

■ 問題
・手配先: {{SupplierName}}
・サービス: {{ServiceType}}
・日付: {{ServiceDate}}
・内容: {{IssueDescription}}

■ お客様への影響
{{ClientImpact}}

■ 推奨する対応
{{RecommendedAction}}

■ 代替案
{{Alternatives}}

至急ご対応ください。

{{AgentName}}`,
  },
  {
    name: 'Supplier Issue Alert (WhatsApp)', channel: 'whatsapp',
    description: '手配先トラブルの緊急アラート（WhatsApp／LINE用・社内向け）。',
    subject: '',
    body: `🚨 *手配先トラブル*

予約: {{BookingRef}} — {{GuestName}}
📅 {{TripDates}}

⚠️ *問題:*
{{SupplierName}} — {{IssueDescription}}

🎯 *必要な対応:*
{{RecommendedAction}}

至急ご対応ください！

{{AgentName}}`,
  },
  {
    name: 'Trip Handover Note', channel: 'email',
    description: '予約の担当引き継ぎメモ（社内向け）。',
    subject: '引き継ぎ: {{BookingRef}} — {{GuestName}}（{{TripDates}}）',
    body: `チームの皆さん

以下の予約を引き継ぎます:

■ 予約内容
・予約番号: {{BookingRef}}
・お客様: {{GuestName}}
・日程: {{TripDates}}
・人数: {{PaxCount}}名
・ツアー: {{TourName}}

■ 状況
・お支払い: {{PaymentStatus}}
・手配先の確認: {{ConfirmationStatus}}

■ 重要事項
{{HandoverNotes}}

■ 未対応事項
{{PendingActions}}

日程表を確認のうえ、お客様に自己紹介のご連絡をお願いします。

よろしくお願いします。
{{AgentName}}`,
  },
  {
    name: 'Weekly Performance Summary', channel: 'email',
    description: '週次の実績サマリー（社内向け）。',
    subject: '週次サマリー — {{WeekStartDate}}の週',
    body: `チームの皆さん

今週の実績サマリーです:

■ 予約
・新規お問い合わせ: {{NewInquiries}}
・送付したお見積り: {{QuotesSent}}
・確定した予約: {{BookingsConfirmed}}
・成約率: {{ConversionRate}}

■ 売上
・受注合計: {{Currency}} {{TotalBooked}}
・入金: {{Currency}} {{PaymentsReceived}}
・未回収: {{Currency}} {{Outstanding}}

■ オペレーション
・終了したツアー: {{TripsCompleted}}
・催行中のツアー: {{ActiveTrips}}
・今後7日間の出発: {{UpcomingTrips}}

■ ハイライト
{{WeeklyHighlights}}

■ 注意が必要な点
{{AreasToWatch}}

今週もお疲れさまでした！
{{AgentName}}`,
  },
]
