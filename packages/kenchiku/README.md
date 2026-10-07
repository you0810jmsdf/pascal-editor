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

知識データの数値は同梱のまま保持しています。N値筋かい補正の原典照合、金物「ぬ」の仕様書とJSONの差異、極端な階高の閾値はソース内TODOを参照してください。Pascalアダプタ、UIは後続STEPの対象です。

## 公開API（STEP 2）

- `bearingRatio(spec, length, ho)`：区間長さ・横架材上端間距離（m）から、各仕様のαhと併用上限適用後の倍率。
- `wallSegments(wall, minLength, ho, quasiWalls?)` / `bearingWalls(building)`：開口控除後の区間、壁別内訳、曲面・斜め壁の集計外件数。
- `wallSufficiency(bearingCm, quasiCm, quakeCm, windCm)` / `existingWall(building)`：準耐力壁等の1/2制限、階別・方向別充足率、壁量の総合判定。
- `quarterBalance(area1, area2, wall1, wall2, lw)` / `quarterStorey(storey, direction, lw, segments)` / `quarterMethod(building)`：側端帯のポリゴン・穴・実面積と耐力壁量、壁率比、四分割の判定。
- `nValue(a1, a2, corner, firstOfTwo, upperCorner?)` / `nValues(building)`：方向別の倍率差・筋かい補正、上下階の出隅判定、柱別N値と金物区分。

併用は `bearing: { kind: 'combined', components: [{ kind: 'brace-45x90' }, { kind: 'panel-plywood' }] }` で指定します。`components`の各仕様で任意倍率・筋かい幅・向きを指定できます。`braceTop: 'start' | 'end'` が無い片筋かいは、提供JSONの規則に従い両端へ正の補正を加えて注記します。`curveOffset`が0以外なら曲面壁として除外します。

`horizontalMemberDistance`は階ごとのHo（m）。省略時は§6.8と同じ梁せい（2階建て1階120mm、最上階105mm）を階高から引いた近似値を使い、explainに記録します。

準耐力壁は壁仕様の`quasi: { kind: 'panel' | 'lath', panelHeightRatio, position?, clearHeight? }`で明示します。通常耐力壁とは別集計です。`faces`で片面・両面を指定します。垂れ壁・腰壁はそれぞれ`position: 'hanging' | 'spandrel'`として別の壁区間を入力し、`clearHeight`（内法m）と高さ比で高さ36cm以上を確認します。幅90cm〜2m・同方向の耐力壁が両端にある区間だけ算入します。開口から準耐力壁を自動生成しません。

必要壁量が0の充足率、両側0などで定義できない壁率比はJSONで保持できる`null`です。判定は壁量を直接比較します。10m×8m矩形の四分割帯は20㎡であり、§11記載の16㎡とは異なるため、形状と指定手計算値は分けてテストしています。「ぬ」は仕様書の25kN×2を表示し、JSONの30kNとの相違が未解決のため計算結果の`requiredKn`を`null`として注記します。

## 検証

ルートで `bun test kenchiku`、`bunx biome check packages/kenchiku`、`bun run build --filter=@nsfactory/kenchiku`。
ビルドは他パッケージと同じTypeScript＋ESM import補正で、ルートのTurboビルドに自動参加します。
