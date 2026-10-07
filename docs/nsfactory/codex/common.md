# 共通指示（建築法対応 フェーズA・Codex 向け）

あなたは `C:\dev\pascal-editor`（pascalorg/editor のフォーク・ブランチ `nsfactory`）で作業する実装担当です。日本語で考え、日本語で報告してください。

## 最初に読むもの（必ず・この順）
1. `docs/nsfactory/kenchiku-spec.md` — 本作業の仕様書。章番号（§）で参照します。
2. `AGENTS.md` と `DECISIONS.md` — リポジトリの不変条件（E-001〜E-015・T-001）。
3. 触る場所の `wiki/architecture/*.md`（`node-schemas.md`・`plugin-authoring.md`・`agent-surfaces.md`・`tools.md`）。
4. 照合データ: `docs/nsfactory/data/kenchiku_vectors.json`（期待値）・`docs/nsfactory/tools/kenchiku_oracle.py`（式の原本・`py kenchiku_oracle.py` で実行可）・`docs/nsfactory/data/timber-fc.json`・`docs/nsfactory/data/n-value-tables.json`。

## 禁止事項
- 開発サーバー（`bun dev`・`next dev`・`vite` 等）を起動しない。終了するコマンドだけ使う。
- `git commit`・`git push`・`git add -A`・ブランチ操作をしない（コミットは Claude が検証後に行う）。
- 仕様書に無い数値を推測で埋めない。分からなければ `// TODO(spec §x.y): 理由` を残し、最終報告に列挙する。
- 既存テストを消す・弱める・skip にしない。既存機能の挙動を変えない（スキーマ拡張は全て optional）。
- `apps/editor/app/*.static.tsx`・`local-scene-editor.tsx`・`lib/local-scenes.ts` は別作業で変更中なので触らない（必要なら報告だけ）。
- 外部 API を実行時に呼ぶコードを書かない（静的サイトでオフライン動作が条件）。

## 作法
- パッケージ管理と実行は `bun`。型は `bun run check-types`、整形・lint は `bun run check`（Biome・自動修正は `bunx biome check --write <paths>`）。
- Windows（PowerShell）で動くコマンドを使う。パスは `/` 区切りで書いてよい。
- 新規パッケージ `packages/kenchiku` は既存の小さなパッケージ（例: `packages/geometry-script`）の `package.json`・`tsconfig.json`・ビルド設定に倣う。ワークスペースに自動で入る（ルート `package.json` の `workspaces: packages/*`）。追加後は `bun install` を1回実行してリンクする。
- 文言: 日本固有の文言は日本語で直接書いてよい。既存 UI の英語キーを使う箇所は `t()`（`packages/editor/src/lib/i18n.ts`）。
- テストは `*.test.ts` を対象ファイルの隣に置き、公開 API 経由で検証する（T-001）。期待値は `kenchiku_vectors.json` と仕様書 §11 の手計算値。
- 各 STEP の最後に必ず実行して通す: `bun run check` と `bun test kenchiku`（STEP 3 以降は `bun run check-types` も）。
- 変更したファイル一覧・追加した TODO・気になる点を最終メッセージに書く。「動くはず」ではなく、実行したコマンドと結果を書く。

## 用語の対応
X方向 = 建物座標系の x 軸に平行な壁、Y方向 = z 軸に平行な壁。cm 単位は壁量、m 単位は幾何、N/㎡・kN/㎡ は荷重。丸めは仕様書の式どおり（`ceil`・10N 単位切上げ）。
