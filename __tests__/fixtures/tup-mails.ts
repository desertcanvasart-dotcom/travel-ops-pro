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
