# @nsfactory/kenchiku

木造在来軸組住宅の仕様規定に関する純関数と知識テーブル。Pascal・Three.js・DOM・外部APIに依存しません。基準施行日は2025-04-01、荷重と柱小径の計算式はHOWTEC表計算ツール2025-12版に基づきます。

本機能の計算結果は設計検討用の参考値です。確認申請に用いるには建築士による入力条件と結果の検証、正規の設計図書としての作成・記名が必要です。

## 公開API（STEP 1）

- `requiredWall(building)`：地震の `lw`（cm/㎡）、`requiredCm`（cm）、`w1/w2`（1階床面積あたりkN/㎡）、`a2`、荷重内訳。配列は1階から昇順。平屋の`w2/a2`は未定義。`referenceGrades`に等級2/3の参考値を返します。
- `columnSizes(building)`：各階の外周柱・内部柱について必要小径、座屈・細長比の内訳、比率表示、実寸との比較。外周／内部の判定は呼出側が柱位置に応じて選びます。
- `columnMinSize(w, l, fc?, ae?)`：柱1本の必要小径（mm）。引数の単位はkN/㎡、mm、N/mm²、㎡。
- `requiredWind(area, coefficient?)`：控除済み見付面積（㎡）から風の必要壁量（cm）。係数は50〜75、既定50。
- `windWall(building)`：各階X/Y方向の風の必要壁量と見付面積内訳。`facade`がある場合は各階各方向を1件ずつ指定します。
- `JpBuildingInput`などの入力型と、`LOADS`、`BEARING_RATIOS`、`N_VALUE_TABLES`、`TIMBER_FC`、`REFERENCES`などの知識テーブル。

計算結果はすべて`{ value, explain }`。`explain`には式・代入値・条文・出典URLを含み、`steps`で中間計算をたどれます。入力を書き換えません。階数3以上・延べ面積300㎡超・最高高さ16m超は`KenchikuScopeError`、不正な数値は`RangeError`です。最高高さの範囲判定は「階高合計＋屋根rise＋基礎土台0.5m」、振動計算用高さは「階高合計＋rise/2＋0.5m」です。

`facade`が無い場合、壁は床外周bbox、屋根は切妻三角形（rise=0なら0.15mの帯）で近似し、その旨を`explain`に残します。X方向の見付幅はY方向の広がりを使います。屋根`silhouette`は各方向の立面多角形で、縦座標の原点を軒高とします。寄棟等の正確な面積は`facade`または`silhouette`で指定してください。

知識データの数値は同梱のまま保持しています。N値筋かい補正の原典照合、金物「ぬ」の仕様書とJSONの差異、極端な階高の閾値はソース内TODOを参照してください。N値計算、存在壁量、四分割、Pascalアダプタ、UIは後続STEPの対象です。

## 検証

ルートで `bun test kenchiku`、`bunx biome check packages/kenchiku`、`bun run build --filter=@nsfactory/kenchiku`。
ビルドは他パッケージと同じTypeScript＋ESM import補正で、ルートのTurboビルドに自動参加します。
