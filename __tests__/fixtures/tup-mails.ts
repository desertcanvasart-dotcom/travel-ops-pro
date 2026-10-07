// Website order notifications (【T-UP】) as the office receives them — the
// customers are invented. Shared by the parser and intake tests.

// The layout of a real 【T-UP】 optional-tour notification from ats-hj.com
// (2026-10), with the customer replaced by an invented one: full-width
// colons, values that run onto the next line, an ideographic-space indent,
// the travellers in ●代表者 / ●同行者N blocks.
export const OPTIONAL_TOUR_MAIL = `オプショナルツアーのお申込みがありました。

●問合せ種別：申込み
●オプショナルコード：EXR-B12-FD
●ツアータイトル：カイロ発着　ルクソール観光　カルナック神殿・王家の谷・ハトシェプスト葬祭殿など
●区分：オプショナルツアー
https://tour.ats-hj.com/opt_detail.php?id=67

●希望利用日：2027/02/24
●参加人数：大人 2人、子供 0人、幼児 0人
●小計:175,000円
●料金備考:※お一人様参加について：
追加料金32,000円にてツアー催行可能です。

※ピーク期の追加料金は旅行代の20%になります。
ピーク期とは4/27〜5/6・8/1〜10・12/20〜1/7の出発期間になります。



●メールアドレス：
yamada.test@example.jp
●電話番号：090-0000-1234
●希望の連絡方法：メール


●お名前(漢字)：山田 花子
●お名前(カナ)：ヤマダ ハナコ

●ご住所：〒 164-0001
　東京都中野区中野1-2-3 テストハイツ101
●ご要望・質問など：



●代表者
　お名前：YAMADA HANAKO
　生年月日：1993/07/11
　性別：女性

●同行者1
　お名前：YAMADA TARO
　生年月日：1990/04/16
　性別：男性
`

// The package-tour notification: the same T-UP layout carrying the
// programme form's fields (tour code, first/second departure, airport, two
// 子供 bands). Built from the form's fields until a real one is on file.
export const PACKAGE_TOUR_MAIL = `ツアーのお申込みがありました。

●問合せ種別：申込み
●ツアーコード：NEK803-ABCR
●ツアータイトル：★ナイル川クルーズの旅、ゆっくり縦断【ギザ地区1泊＆アブシンベル1泊、ナイル川クルーズ船３泊】ハイライト８日間
●区分：パッケージツアー
https://tour.ats-hj.com/detail.php?id=803

●出発日(第1希望)：2026/10/16
●出発日(第2希望)：----/--/--
●出発地：成田
●参加人数：大人 2人、子供 1人、子供 0人
●小計:1,250,000円

●メールアドレス：
sato.test@example.jp
●電話番号：03-0000-5678
●希望の連絡方法：電話

●お名前(漢字)：佐藤 一郎
●お名前(カナ)：サトウ イチロウ

●ご住所：〒 150-0001
　東京都渋谷区神宮前9-9-9
●ご要望・質問など：
窓側の席を希望します。
ベジタリアン食をお願いします。

●代表者
　お名前：SATO ICHIRO
　生年月日：1970/01/02
　性別：男性

●同行者1
　お名前：SATO YUKI
　生年月日：1972/03/04
　性別：女性

●同行者2
　お名前：SATO KEN
　生年月日：2016/05/06
　性別：男性

------------------------------------------------
株式会社エー・ティー・エス
https://ats-hj.com/
`

// A REAL package-tour notification as the office received it (2026-08-30,
// forwarded from Outlook), layout kept to the character — the 【Tアップ】
// subject, the header rules, 問合せ内容, the title wrapped mid-phrase,
// 希望出発日(第N希望) with weekday, the per-date base fare instead of a 小計,
// the lead's romaji, sex and birth at the top level (no ●代表者 block), the
// address over two lines, a companion's birth date in quotes, and three
// adults with one companion named. The customer is replaced with an invented
// one: this repository is public.
export const REAL_TOUR_MAIL = `From: sato.test@example.jp <sato.test@example.jp>
Sent: Sunday, August 30, 2026 3:06 PM
To: info@example.com
Subject: 【Tアップ】ツアーお問合せ (10/9出発)

-----------------------------------------------
Tアップにてユーザより、お問合せがありました。
ご回答をお願い致します。
-----------------------------------------------

●問合せ内容：申込み

●希望連絡方法：メール

●ツアーコード：NEK502
●ツアータイトル：★国内線移動で楽々★古代遺跡の宝庫・エジプトを満喫！★2大
都市カイロ・ギザ/ルクソール★５日間の旅!
●区分：ツアー
http://tour.ats-hj.com/detail.php?id=2297504&hf=0

●希望出発日(第1希望)：2026年10月9日(金)
●第1希望日基本旅行代金：大人 348,000円
●希望出発日(第2希望)：2026年10月8日(木)
●第2希望日基本旅行代金：大人 348,000円
●出発地：成田

●参加人数：大人 3人、子供 0人、幼児 0人


●メールアドレス：sato.test@example.jp
●電話番号：09000001111

●お名前(漢字)：佐藤 花子
●お名前(カナ)：サトウ ハナコ
●性別：女性
●生年月日：1997年7月14日(29歳)
●ご要望・質問など：



●お名前：SATO HANAKO
●ご住所：〒 100-0001 東京都
千代田区千代田9-9-9-202
●同行者1
　お名前：SUZUKI MAI
　生年月日：'1998/6/7'
　性別：女性
`
