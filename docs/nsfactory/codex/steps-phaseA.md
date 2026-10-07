# 区切り定義（建築法対応 フェーズA）

## STEP 1: パッケージ新設・知識テーブル・必要壁量と柱の小径
目的: `packages/kenchiku`（npm 名 `@nsfactory/kenchiku`・Pascal 非依存）を作り、仕様書 §3 の入力モデル型、§4 の知識テーブル、§6.2（地震の必要壁量 Lw）・§6.3（風）・§6.8（柱の小径）の純関数を実装する。
- ファイル構成の目安: `src/index.ts`、`src/model.ts`、`src/explain.ts`、`src/knowledge/{loads,bearing-ratios,n-value,timber-fc,references}.ts`、`src/structural/{required-wall,wind,column-size}.ts`、`src/__fixtures__/kenchiku_vectors.json`（`docs/nsfactory/data/` からコピー）。
- `timber-fc.ts` は `docs/nsfactory/data/timber-fc.json` を TypeScript の配列として取り込む（169件）。`n-value.ts` は `n-value-tables.json` から。
- 式と丸めは `docs/nsfactory/tools/kenchiku_oracle.py` と仕様書 §6.2・§6.8 に厳密に合わせる。結果はすべて `{ value, explain }`（式・代入値・条文・出典URL）。
- 2階建てと平屋の両方。3階以上・300㎡超・16m超はエラー（`KenchikuScopeError`）。
完了条件: `bun test kenchiku` で `kenchiku_vectors.json` の全ケース（Lw・柱 de・A2・W1/W2 小数4桁）が一致。`bunx biome check packages/kenchiku` 指摘ゼロ。`packages/kenchiku` が `bun run build` に組み込まれる（他パッケージと同じビルド方式）。

## STEP 2: 存在壁量・判定・四分割法・N値
目的: 仕様書 §6.4〜§6.7 を純関数で実装する（入力は §3 の `JpBuildingInput`・幾何はすでに建物座標系に変換済みとする）。
- 耐力壁区間の切り出し（開口の控除・最小長さ・方向判定±22.5°・曲面/斜め壁の集計外カウント）。
- 倍率の決定（§4.2・併用の和・上限 7.0/5.0・αh）。準耐力壁等は `quasiWalls` のときのみ別集計し 1/2 クランプ。
- 判定（各階各方向・充足率・総合）。四分割法（ポリゴンの帯切り出しは `packages/kenchiku` 内に小さなポリゴン交差ユーティリティを実装する。core の `polygon-boolean` は import しない）。N値（§4.3・`n-value-tables.json`・出隅判定・上階柱の照合）。
- 仕様書 §11 の手計算ケースをテストにする（10m壁+1.8m開口、併用クランプ、四分割 10m×8m、N値 2例、風 2例）。
完了条件: 上記テスト全通過。`bun run check` 通過。

## STEP 3: スキーマ拡張とアダプタ（core）
目的: 仕様書 §5 の optional フィールド（`SiteNode.jp`・`BuildingNode.jp`・`WallNode.jp`・`ZoneNode.jp`）を zod スキーマに追加し、§6.1 のアダプタ `packages/core/src/kenchiku/adapter.ts`（シーングラフ → `JpBuildingInput`）を実装する。
- core → kenchiku の依存を許可する（`biome.jsonc` の `noRestrictedImports`、`packages/core/src/architecture.test.ts`、`packages/core/package.json` の依存に `@nsfactory/kenchiku: workspace:*`）。E-001 の矢印に kenchiku を最下層として足す旨をコメントで書く。
- 階高・壁・開口（`position[0]` = 壁始点からの u、`width`、`height`）・部屋・階段・柱・屋根（pitch→寸、overhang、最高高さ−軒高）・床面積ポリゴン（壁芯・§6.1(3)）・見付面積（§6.1(6)）を取り出す。使った近似は explain に残す。
- fixture シーン `packages/core/src/kenchiku/__fixtures__/wood-two-storey.json`（2階建て 7.28m×9.1m 矩形、各階4外壁＋間仕切2、各外壁に窓1、屋根あり）を既存の `createNode`／スキーマで作り、アダプタのテスト（床面積 66.25㎡±1%、壁本数、区間長、階高）と、旧シーン互換テスト（`jp` 無しの JSON が parse でき、`jp` 付きが往復できる）を書く。
完了条件: テスト通過、`bun run check-types` 通過、既存テスト（`bun test packages/core`）が壊れていない。

## STEP 4: 建築法チェック（構造以外）
目的: 仕様書 §7 の全チェックを `packages/kenchiku/src/code-check/` に純関数で実装し、アダプタで `JpSiteInput`（敷地ポリゴン・`northRotation`・`SiteNode.jp`）を渡す。
- 入力が無い項目は `input-needed`。斜線は建物外形の頂点ごとの高さ判定で簡略に。採光補正係数は用途地域で式を切替。
- 境界値テスト（§11）を書く。
完了条件: テスト通過、`bun run check`・`check-types` 通過。

## STEP 5: 図書 D1〜D9 の HTML 生成
目的: 仕様書 §8 の 9 図書を `packages/kenchiku/src/documents/` に純関数（入力: 計算結果とチェック結果、出力: HTML 文字列）で実装する。
- A4 印刷 CSS、免責、基準日、SVG の配置図（耐力壁の色分け・四分割線・柱位置）。`document.write` は使わない。
- テスト: fixture で各図書が生成され、D1 に「必要壁量」「存在壁量」「判定」、D2 に「壁率比」、D3 に金物記号、D6 に「延べ面積」が含まれることを確認（文言固定ではなく主要語の存在のみ）。
完了条件: テスト通過、`bun run check` 通過。

## STEP 6: エディタ UI
目的: 仕様書 §9。サイドバー「建築法規」パネル（`packages/editor/src/components/ui/sidebar/panels/kenchiku-panel/`）、壁インスペクタの「耐力壁の仕様」欄（`packages/nodes/src/wall` の parametrics）、平面図オーバーレイ（耐力壁の色分け・表示切替）、3D 側の同色帯（難しければ 2D のみにし理由を報告）。
- パネルの登録は既存の site-panel／zone-panel と同じ経路（アイコンレール・`EditorHostPanel` またはビルトインの登録箇所を読んで倣う）。
- 「計算する」ボタンでアダプタ→エンジンを実行し、結果を editor 側の Zustand ストアに保持。シーン変更で「古い結果」バッジ。図書はタブで Blob URL を開く。
- 既存の UI テストの流儀があれば最小限のテストを足す。
完了条件: `bun run check-types`・`bun run check`・`bun test kenchiku` 通過。`cd apps/editor && bun run build:static` が成功（実行して結果を報告）。

## STEP 7: エージェントツール（MCP／チャット）
目的: 仕様書 §10。契約 `packages/core/src/agent-tools/kenchiku.ts`（zod のみ）、操作 `packages/core/src/agent-operations/kenchiku.ts`（`AGENT_OPERATIONS` に登録）、MCP 登録（`packages/mcp` の既存ツール登録に倣う）、`wiki/architecture/agent-surfaces.md` のパリティ表と `skills/pascal-3d` への一節追加。
- `jp_structural_check`・`jp_building_code_check`・`jp_set_wall_bearing`・`jp_get_documents`。読み取り系は fixture シーンでのテスト、書き込み系は壁の `jp.bearing` が更新されるテスト。
完了条件: テスト通過、`bun run skills:validate`・`bun run check`・`check-types` 通過。

## STEP 8: 参考機能・ドキュメント・最終確認
目的: 仕様書 §6.9（偏心率・横架材の目安・基礎の接地圧略算。旧 `kabe.js`/`structure.js` の考え方を移植、図書では「参考」章）、`wiki/architecture/kenchiku.md`（新パッケージの境界・入力モデル・テストの流儀）、`CHANGELOG.md` 追記。
- 最後に `bun run check-types`・`bun test`（全体）・`bun run build`・`cd apps/editor && bun run build:static` を実行し、結果（成功/失敗と所要時間）を報告する。自分の変更に起因する失敗は直す。`bun run check`（Biome 全体）は既存コードの指摘で落ちることが分かっているので、自分が触ったパスだけ `bunx biome check` で確認し、全体の結果は「既存の指摘一覧」として報告するだけでよい。
完了条件: `bun run check-types`・`bun test`・`bun run build` が exit 0、`build:static` 成功、触ったパスの Biome 指摘ゼロ、仕様書 §12 の受け入れ基準 2〜4・6・7 を満たすこと（1 の Biome 全体は Claude が別途扱う。5 は Claude が目視）。
