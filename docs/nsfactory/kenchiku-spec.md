# 建築3Dエディタ（Pascal 日本語版）建築法対応 仕様書 v1.0

- 作成: 2026-10-07（N's factory・事業主決定「対象範囲はすべて。A から順に」）
- 正本: `C:\dev\pascal-editor\docs\nsfactory\kenchiku-spec.md`（複製: `OneDrive\レザークラフト\デジタル部\建築3Dエディタ_Pascal\仕様書_建築法対応_v1.md`）
- 関連: 調査記録と一次資料は `OneDrive\共通ナレッジ\建築工学・建築法\`（アプリと切り離した知識の正本。事業の中身は書かない）
- 検証用オラクル: `docs/nsfactory/tools/kenchiku_oracle.py`、期待値: `docs/nsfactory/data/kenchiku_vectors.json`、木材強度: `docs/nsfactory/data/timber-fc.json`

---

## 0. この文書について

### 0.1 目的
公開中の建築3Dエディタ https://you0810jmsdf.github.io/pascal-editor/ （pascalorg/editor のフォーク・ブランチ `nsfactory`）に、日本の建築法規（建築基準法・同施行令・告示・建築物省エネ法）を**設計用の知識**として備え、木造住宅を建てるために必要な**確認事項の自動チェック**と、**確認申請で求められる構造関係図書（壁量計算書等）の作成機能**を実装する。

### 0.2 対象範囲とフェーズ（事業主決定 2026-10-07）
| フェーズ | 対象 | 構造の確認方法 | 本書での扱い |
|---|---|---|---|
| **A（本書で実装）** | 木造在来軸組・階数2以下・延べ面積300㎡以下・高さ16m以下の戸建て住宅（2025-04改正後の「新2号建築物」および平屋200㎡以下の「新3号」） | 仕様規定（壁量計算・四分割法・N値計算・柱の小径・基礎等の告示仕様） | §5〜§13 を実装 |
| B（次） | 木造3階建て、または300㎡超500㎡以下 | 許容応力度計算（令82条・ルート1） | §14 ロードマップ |
| C（その後） | 鉄骨造・RC造 | 構造計算（ルート1〜3） | §14 ロードマップ |

### 0.3 二つの利用者を前提にする（事業主指示 2026-10-07）
1. N's factory の建築3Dエディタ（本リポジトリ）
2. 将来の **建築工学の学習支援アプリ**（別アプリ）

このため、法規の知識・計算エンジン・図書テンプレートは **Pascal に依存しない独立パッケージ `@nsfactory/kenchiku`（`packages/kenchiku`）** として実装し、Pascal 側はシーングラフをエンジンの入力モデルへ変換する**アダプタ**だけを持つ。すべての計算結果には「式・代入した値・根拠条文・出典URL」を持つ **explain データ**を必ず付ける（学習アプリで式の導出を見せるため）。

### 0.4 免責（UI・図書の冒頭に必ず表示）
本機能の計算結果は設計検討用の参考値である。確認申請に用いるには建築士による入力条件と結果の検証、正規の設計図書としての作成・記名が必要。法令・告示は改正されるため、知識テーブルには施行日と出典を持ち、UI に「基準日」を表示する。

### 0.5 用語
- **Lw**: 階の床面積に乗ずる数値（cm/㎡）。必要壁量 ＝ Lw × 床面積。
- **存在壁量**: Σ（耐力壁の長さ cm × 壁倍率）。
- **X方向/Y方向**: 建物の桁行・張り間に相当する直交2方向。本書では建物座標系（BuildingNode.rotation を戻した後の平面）の x 軸・z 軸とし、UI では「X方向」「Y方向」と表記。

---

## 1. 調査結果の要約と設計への反映

### 1.1 公開データ（調査①）
| データ | 入手先 | 形式 | 本仕様での使い方 |
|---|---|---|---|
| 建築基準法・施行令・施行規則・省エネ法・都市計画法の本文 | e-Gov 法令API v2 `https://laws.e-gov.go.jp/api/2/law_data/<法令ID>?response_format=json&elm=MainProvision-Article_<条>`（建基法 325AC0000000201／令 325CO0000000338／規則 325M50004000040／省エネ法 427AC0000000053／都計法 343AC0000000100）。PDL1.0（商用可・出典明記） | JSON/XML | **オフライン前提のため実行時には呼ばない**。知識テーブルに条番号と e-Gov の条文URLを持ち、UIから「条文を開く」リンクで参照。将来、学習アプリでは API から条文全文を表示してよい |
| 告示（1100号・1349号・1460号・1347号・令和7年告示215号 等） | 国交省 PDF のみ（機械可読なし） | PDF | 必要な数値・式を**手で構造化**して知識テーブルに収録（出典URL・告示番号・施行日付き） |
| 壁量・柱小径の公式計算ツール | 国交省が技術的助言で使用可能と位置付けた HOWTEC「在来軸組工法用 表計算ツール」(Excel) と早見表 https://www.howtec.or.jp/publics/index/411/ | xlsx / PDF | **算定式・定数・丸めをそのまま移植**（§6.2・§6.8）。公式ツールの入力例で照合済み（1階44・2階25 cm/㎡、柱84/105mm） |
| 用途地域・建ぺい率・容積率・防火・高度地区 | 国土数値情報 A55（2024年度）GeoJSON | GeoJSON | フェーズAでは**人が入力**（§5.1）。GIS 取り込みは将来 |
| 地盤・ハザード | J-SHIS API、ハザードマップポータル、KuniJiban | API/タイル | フェーズAでは対象外（リンク表示のみ） |
| 確認申請の様式 | 千葉県・指定確認検査機関の Word/PDF | docx | 様式そのものは作らない。図書に載せる値を**転記しやすい一覧**として出力（§8） |

### 1.2 構造審査の要件（調査②・2025-04-01 施行、経過措置は 2026-03-31 で終了）
| 区分 | 条件 | 審査 |
|---|---|---|
| 新3号 | 木造平屋・200㎡以下 | 構造審査省略（図書一部省略）。ただし令46条4項（壁量）は階数2以上または50㎡超で適用されるので、本機能は平屋でも計算する |
| 新2号 | 木造2階建て以上、または平屋200㎡超 | 階数2以下・300㎡以下・高さ16m以下 → **仕様規定で確認**（壁量・四分割法・N値・柱の小径・基礎告示）。300㎡超／階数3／16m超 → 許容応力度計算 |

主な改正点（技術的助言 国住指第425号で確認）:
- 必要壁量は「軽い屋根／重い屋根」の表を廃止し、**建物の荷重の実況に基づく算定式** `Lw = (Ai・C0・Σwi)/(0.0196・Afi)` に一本化（旧令46条表2 11/29/15・15/33/21 は使えない）。
- 準耐力壁等（面材・木ずり・垂れ壁・腰壁）を存在壁量に算入可（必要壁量の1/2まで。超えるときは脆性破壊の検証）。
- 軸組を併用した倍率の上限 5 → **7**（9cm角たすき掛けは従来どおり5）。
- 筋かいを入れた軸組の高さが 3.2m を超えるときは倍率に `αh = 3.5×Ld/Ho (≦1.0)` を乗ずる。
- 柱の小径は割合表を廃止し、`de/l = 0.027 + 22.5・Wd/l²`（または座屈式）で算定。有効細長比 150 以下（令43条6項）。
- 横架材上端間の距離が 3.2m を超える場合は告示1460号の表によらず N値計算法が必須。

### 1.3 構造以外の確認事項（調査③）
集団規定（接道・建ぺい率・容積率・高さ・斜線・日影・防火・外壁後退）、単体規定（採光1/7・換気1/20・24時間換気・天井高2.1m・階段・床高45cm・便所・火気使用室の内装）、省エネ適合義務（2025-04〜・住宅は仕様基準で計算省略可）、手続き（確認申請35日／7日、印西市は限定特定行政庁で2階以下・300㎡以下・16m以下は市の窓口、千葉県指定では非分譲木造2階建ては中間検査対象外）。詳細は §7。

### 1.4 既存「強度計算ツール」（旧 建築3Dモデラー `digital-room/arch-modeler/src/kabe.js, structure.js, report.js`）の検証結果
| 項目 | 旧実装 | 現行法（2025-04〜） | 判定 | 本仕様での対応 |
|---|---|---|---|---|
| 地震の必要壁量 | 旧令46条表2（11/29/15・15/33/21 cm/㎡） | 廃止。荷重算定式 | **不適合** | §6.2 の算定式へ全面置換 |
| 風の必要壁量 | 見付面積×50、床+1.35m控除 | 同じ（特定行政庁指定区域は50超75以下） | 適合 | 係数を入力化（50〜75） |
| 存在壁量 | 全壁一律の倍率 | 軸組の仕様ごとの倍率（別表1）・上限7・αh | 不十分 | 壁ごとの仕様（§5.3）・上限・αh |
| 耐力壁の最小長さ | 0.9m | 実務慣行（告示の面材は幅90cm以上） | 概ね適合 | 既定0.9mを設定値に |
| 床面積 | 壁の外形矩形で近似 | 壁芯で囲む実面積 | 不十分（凹型で過大） | 壁芯ポリゴンの実面積（§6.1） |
| 四分割法 | 外形矩形の1/4で床面積近似 | 側端部分の実床面積 | 不十分 | ポリゴン切り出し（§6.6） |
| N値計算 | N=A1·B1+A2·B2−L、B 0.5/0.8、L 0.6/0.4・1.6/1.0 | 同じ（筋かい補正あり） | 概ね適合 | 筋かい補正値を追加・金物表(い〜ぬ)は N≦5.6 で「ぬ=25kN×2」に修正、超過は「要個別計算」 |
| 偏心率・横架材・基礎 | 略算 | 偏心率は四分割の代替（≦0.3）、横架材・基礎は参考 | 参考扱い | フェーズA後半（§6.9）で任意機能として移植。図書では「参考」章に隔離 |
| 帳票 | HTML を別ウィンドウで生成し印刷 | ― | 流用可 | §8 の様式でテンプレートを書き直す |

---

## 2. アーキテクチャ方針

### 2.1 パッケージ構成（新設は太字）
| 場所 | 役割 | 依存 |
|---|---|---|
| **`packages/kenchiku`**（npm 名 `@nsfactory/kenchiku`） | 法規知識テーブル・計算エンジン・法規チェック・図書テンプレート（HTML文字列生成）。**Pascal を一切 import しない**。依存は `zod` のみ（入力検証用。無くても可） | なし |
| `packages/core/src/kenchiku/` | **アダプタ**: シーングラフ（site/building/level/wall/door/window/zone/slab/roof/column/stair）→ `@nsfactory/kenchiku` の入力モデル。スキーマ拡張（§5）。agent-operations（§10） | core → kenchiku（E-001 の矢印に kenchiku を最下層として追加。`biome.jsonc` の `noRestrictedImports` と `architecture.test.ts` を更新） |
| `packages/core/src/agent-tools/kenchiku.ts` | MCP／チャット共通のツール契約（zod のみ） | core |
| `packages/editor/src/components/ui/sidebar/panels/kenchiku-panel/` | サイドバー「建築法規」パネル・設定フォーム・結果表示・図書を開くボタン | editor |
| `packages/nodes/src/wall/`（既存） | 壁インスペクタに「耐力壁の仕様」欄を追加（parametrics） | nodes |
| `packages/editor/src/components/editor-2d/`（既存） | 平面図に耐力壁の色分けオーバーレイ（E-006 のため 3D 側は壁の上面に細い帯で同じ色を出す。難しければ 2D のみとし PR 説明に理由を書く） | editor |
| `apps/editor` | 変更なし（静的ビルドで動くこと） | ― |

### 2.2 守る不変条件（`DECISIONS.md`）
- E-001: core は Three.js を import しない。計算は純関数。
- E-003: スキーマ拡張はすべて **optional** フィールド。旧シーンは無変更で読める。マイグレーションは不要（絶対に既存フィールドの意味を変えない）。
- E-006: 2D↔3D パリティ（耐力壁の色分け）。
- E-010: 既存のレジストリ・キャッシュ・ツールを迂回しない。agent tool とチェックを同じスライスで出す。
- T-001: テストは公開 API 経由。オラクルの期待値（`kenchiku_vectors.json`）を fixture にする。スナップショットや文言固定のテストは書かない。
- 既存テストを弱めない・消さない。`bun run ci` が通ること。

### 2.3 静的ビルド・オフライン
- GitHub Pages の静的版（`apps/editor` の `bun run build:static`）で**ネットワーク無しに**全機能が動く。外部 API 呼び出しは禁止（条文はリンクのみ）。
- 日本語フォントの PDF 埋め込みは行わない。図書は **HTML 印刷ビュー**（§8）。

### 2.4 国際化
- 既存の `t()`（`packages/editor/src/lib/i18n.ts`・辞書 `i18n-ja.ts`）に従う。既存の英語キーに対応する日本語は辞書へ。**この機能固有の文言（条文名・図書名など英語に対応物が無いもの）は日本語をそのまま書いてよい**（t() を通さない）。

---

## 3. 入力モデル（`@nsfactory/kenchiku` の公開型・Pascal 非依存）

```ts
export type Pt = [number, number]                     // 平面座標 (m)。建物座標系。x = X方向、y = Y方向
export type Dir = 'x' | 'y'

export interface JpOpening { u: number; width: number; bottom: number; height: number; kind: 'door' | 'window' | 'opening' }
// u: 壁始点からの中心位置(m)。bottom: 壁基準面からの下端(m)

export interface JpBearingSpec {
  kind: BearingKind            // §4.2 の列挙（'none' = 非耐力壁）
  ratioOverride?: number       // 'custom' のとき倍率を直接入力
  faces?: 'one' | 'both'       // 木ずり・面材の片面/両面
  braceLengthMm?: number       // αh 用 Ld（省略時は区間長さ）
}
export interface JpWall { id: string; start: Pt; end: Pt; thickness: number; height: number; openings: JpOpening[]; bearing?: JpBearingSpec; exterior?: boolean }
export interface JpColumn { id: string; at: Pt; sizeMm?: [number, number]; through?: boolean }   // 任意（柱ノードがある場合）
export interface JpRoom { id: string; name: string; polygon: Pt[]; area: number; kind: RoomKind; ceilingHeight: number; windows: JpOpening[]; openableArea?: number }

export interface JpStorey {
  index: 1 | 2 | 3
  height: number               // 階高(m)（床〜上階床、最上階は床〜桁上端）
  floorPolygon: Pt[]           // 壁芯で囲む床面積の外周（穴なし。吹抜けは holes に）
  holes?: Pt[][]
  floorArea: number            // 法定床面積(㎡)。アダプタが polygon から算出して入れる
  walls: JpWall[]
  columns?: JpColumn[]
  rooms?: JpRoom[]
  stairs?: { riser: number; tread: number; width: number; id: string }[]
}

export interface JpRoof { kind: 'tile' | 'slate' | 'metal'; rise: number /*最高高さ−軒高 m*/; overhang: number /*軒の出 m*/; pitchSun: number /*勾配(寸)*/ ; silhouette?: { x: Pt[]; y: Pt[] } /*見付面積用の立面投影*/ }

export interface JpBuildingInput {
  storeys: JpStorey[]
  roof: JpRoof
  extWall: 'earthen' | 'mortar' | 'siding' | 'metal' | 'board'
  pv: { kind: 'none' | 'standard' | 'custom'; loadNPerM2?: number }
  ceilingInsulationNPerM2: number     // 既定 100
  wallInsulationNPerM2: number        // 既定 70
  use: 'house' | 'office'             // 積載荷重の区分（既定 house）
  c0: 0.2 | 0.3                        // 標準せん断力係数（令88条2項区域は0.3）
  windCoef: number                     // 風の必要壁量係数 cm/㎡（50〜75、既定50）
  snow?: { depthCm: number; unitNPerM2PerCm: number }   // 多雪区域（等級2/3の参考計算にのみ使用）
  timber: { standard: string; species: string; grade: string; fc: number }   // 既定 すぎ無等級 17.7
  minBearingLength: number             // 耐力壁とみなす最小長さ m（既定 0.9）
  quasiWalls: boolean                  // 準耐力壁等を算入するか（既定 false）
  facade?: { x: FacadeArea[]; y: FacadeArea[] }   // アダプタが計算した見付面積（階ごと）。無ければエンジンが bbox と roof から近似
  site?: JpSiteInput                   // §7 用
}
```

出力は必ず `{ value, explain }` 形で、`explain: { formula: string; substituted: string; references: { law: string; article: string; url?: string }[]; notes?: string[] }` を持つ（学習アプリ用）。

---

## 4. 知識テーブル（`packages/kenchiku/src/knowledge/`・値はすべて出典コメント付き）

### 4.1 荷重の定数（公式表計算ツール 2025-12版より。単位 N/㎡）
| 区分 | 選択肢 | 値 | 備考 |
|---|---|---|---|
| 屋根 G1（屋根面積あたり） | 瓦屋根（ふき土無）/ スレート屋根 / 金属板ぶき | 990 / 740 / 500 | 屋根面積割増係数 Z2 を乗ずる |
| 太陽光 D2（屋根面積あたり） | なし / あり(標準) / 任意 | 0 / 200 / 入力 | Z2 を乗ずる |
| 天井（屋根）断熱 D1（床面積あたり） | 既定 | 100 | 任意入力可 |
| 外壁 G2（壁面積あたり） | 土塗り壁等 / モルタル等 / サイディング / 金属板張 / 下見板張 | 1000 / 890 / 600 / 500 / 350 | 床面積あたりへ換算（§6.2） |
| 外壁断熱 D3（壁面積あたり） | 既定 | 70 | 同上 |
| 高断熱窓 D4（開口面積あたり） | 常に算入 | 400 | 壁面積の9%を開口とみなす |
| 内壁 G3（床面積あたり・階高2.8m時） | せっこうボード | 200 | 階高 h のとき 200×h/2.8 |
| 床 G4 | ― | 610 | |
| 積載 P1（地震力算定用） | 住宅 / 事務所 | 600 / 800 | 令85条 |
| 積載（柱の小径用） | 住宅 / 事務所 | 1300 / 1800 | 令85条 |
| 基準建物の平面 | ― | 6.0m × 16.5m（外周45m） | 壁荷重の床面積換算に使う仮定 |
| 標準せん断力係数 C0 | ― | 0.2（令88条2項区域 0.3） | |
| 振動特性係数 Rt | ― | 1.0 | |
| 基礎・土台の高さ | ― | 0.5m | 算定用建物高さに加算 |
| 柱の負担面積 Ae | ― | 5.0㎡ | 柱1本あたりの仮定 |
| 長期係数 Kd | ― | 1.1（Kd/3 を使う） | |
| 木材の圧縮基準強度 Fc | 169件（無等級材・JAS製材・集成材・LVL） | `docs/nsfactory/data/timber-fc.json` を `knowledge/timber-fc.ts` に取り込む | 既定 すぎ無等級 17.7 N/mm² |

### 4.2 壁倍率（昭和56年建設省告示第1100号 別表第1 ＝ 旧令46条4項表1。`BearingKind` の列挙）
| kind | 軸組 | 倍率 |
|---|---|---|
| `none` | 耐力壁としない | 0 |
| `lath-one` / `lath-both` | 木ずり等を片面 / 両面 | 0.5 / 1.0 |
| `brace-15x90` | 厚さ1.5cm×幅9cm の木材筋かい、または径9mm 鉄筋 | 1.0 |
| `brace-30x90` | 3cm×9cm 木材筋かい | 1.5 |
| `brace-45x90` | 4.5cm×9cm 木材筋かい | 2.0 |
| `brace-90x90` | 9cm×9cm 木材筋かい | 3.0 |
| `brace-15x90-x` / `brace-30x90-x` / `brace-45x90-x` / `brace-90x90-x` | たすき掛け | 2.0 / 3.0 / 4.0 / 5.0 |
| `panel-plywood` | 構造用合板（大壁・N50@150 等 告示仕様） | 2.5 |
| `panel-gypsum` | せっこうボード（大壁） | 0.9 |
| `panel-other` | その他の面材（別表1 のうち上記以外） | `ratioOverride` 必須 |
| `custom` | 大臣認定等 | `ratioOverride` 必須 |
| `combined` | 併用（複数 kind を配列で持つ） | 和。上限 7.0（9cm角たすきを含む場合は 5.0） |

αh: 筋かい系 kind で `Ho`（横架材上端間距離≒階高−梁せい）> 3.2m のとき `ratio × min(1, 3.5×Ld/Ho)`。出典: 技術的助言 国住指第425号 第4(2)。

準耐力壁等（`quasiWalls = true` のときのみ）: 面材 `0.6 × 基準倍率 × 面材高さ/横架材内法`、木ずり `0.5 × 高さ/内法`、片面上限1.5。幅90cm以上、垂れ壁・腰壁は幅90cm〜2m・高さ36cm以上で両側に耐力壁。算入合計は各階各方向の必要壁量の1/2以下にクランプし、超過分は警告（フェーズA では UI を簡素に: 「準耐力壁等として算入」チェックと面材種別のみ）。

### 4.3 N値計算（平成12年建設省告示第1460号 第2号 表三・表四）
- 平屋・最上階: `N = A1×B1 − L`、B1 = 0.5（出隅 0.8）、L = 0.6（出隅 0.4）
- 2階建ての1階: `N = A1×B1 + A2×B2 − L`、B2 = 0.5（出隅 0.8）、L = 1.6（出隅 1.0）
- A1/A2: 当該柱の両側の軸組の倍率の差（筋かいは補正値を加える）。補正値の表は `knowledge/n-value.ts` に `docs/nsfactory/data/n-value-tables.json` から取り込む（Claude が告示本文で照合して用意する。**Codex は値を推測で埋めない**。JSON が無ければ補正値 0 で実装し TODO を残す）。
- 金物の区分: い N≦0 ／ ろ ≦0.65 ／ は ≦1.0 ／ に ≦1.4 ／ ほ ≦1.6 ／ へ ≦1.8（HD10kN）／ と ≦2.8（15kN）／ ち ≦3.7（20kN）／ り ≦4.7（25kN）／ ぬ ≦5.6（(と) の仕口を2組＝15kN×2＝30kN）／ 5.6超 → 「告示仕様外・要個別計算」。必要耐力は `n-value-tables.json` を正とする（2026-10-07 訂正: 旧記載「25kN×2」は誤り）。
- 横架材上端間距離 > 3.2m の階は結果に「N値計算法が必須」の注記（告示の表を使えない）。

### 4.4 風圧（令46条4項・告示1100号）
必要壁量 ＝ 見付面積（その階の床面から1.35m以下の部分を除く鉛直投影面積）× 係数（一般 50、特定行政庁指定区域 50超〜75 cm/㎡）。X方向の壁には X 方向から見た立面（幅 = Y方向の広がり）、Y方向の壁には Y 方向から見た立面を使う。

### 4.5 条文メタ（`knowledge/references.ts`）
各チェック・計算に `{ law: '建築基準法施行令', article: '第46条第4項', url: 'https://laws.e-gov.go.jp/law/325CO0000000338#Mp-At_46' }` 形式で付ける。URL は e-Gov の法令ページ（条アンカーが効かなければ法令トップ）。告示は国交省 PDF の URL。

---

## 5. データモデル拡張（`packages/core/src/schema/nodes/*.ts`・すべて optional・`jp` 名前空間）

### 5.1 `SiteNode.jp`（敷地の法規属性。人が入力）
```ts
jp: z.object({
  zoning: z.enum(['R1-low','R2-low','R-garden','R1-mid','R2-mid','R1','R2','quasi-R','neighbor-com','com','quasi-ind','ind','ind-only','none']).optional(), // 用途地域
  kenpeiPct: z.number().min(0).max(100).optional(),     // 指定建ぺい率
  yosekiPct: z.number().min(0).max(1300).optional(),    // 指定容積率
  cornerLotBonus: z.boolean().optional(),               // 角地緩和 +10
  fireZone: z.enum(['none','quasi','fire','art22']).optional(),
  heightDistrict: z.string().optional(),
  absoluteHeightLimit: z.number().optional(),           // 低層住専 10/12 m
  wallSetback: z.number().optional(),                   // 外壁後退 1.0/1.5 m
  roads: z.array(z.object({ edgeIndex: z.number().int(), width: z.number(), type: z.enum(['art42-1','art42-2','other']) })).optional(), // 接道（敷地境界の辺番号と幅員）
  shadowRegulation: z.object({ measureHeight: z.number(), hours5to10: z.number(), hoursOver10: z.number() }).optional(),
  seismicC0: z.union([z.literal(0.2), z.literal(0.3)]).optional(),
  windCoef: z.number().min(50).max(75).optional(),
  snow: z.object({ depthCm: z.number(), unitNPerM2PerCm: z.number() }).optional(),
  energyRegion: z.number().int().min(1).max(8).optional(),   // 省エネ地域区分
  authority: z.string().optional(),                           // 提出先メモ（例: 印西市 開発建築課）
  notes: z.string().optional(),
}).optional()
```
真北は既存 `northRotation` を使う。敷地境界は既存 `polygon`。

### 5.2 `BuildingNode.jp`（建物の構造・仕様）
```ts
jp: z.object({
  structure: z.enum(['wood-conventional','wood-3storey','steel','rc']).default('wood-conventional'),
  roofKind: z.enum(['tile','slate','metal']).optional(),
  extWall: z.enum(['earthen','mortar','siding','metal','board']).optional(),
  pv: z.object({ kind: z.enum(['none','standard','custom']), loadNPerM2: z.number().optional() }).optional(),
  ceilingInsulationNPerM2: z.number().optional(),
  wallInsulationNPerM2: z.number().optional(),
  use: z.enum(['house','office']).optional(),
  roofRiseOverride: z.number().optional(),      // 最高高さ−軒高（屋根ノードから自動算出できないとき）
  overhangOverride: z.number().optional(),
  pitchSunOverride: z.number().optional(),
  timber: z.object({ standard: z.string(), species: z.string(), grade: z.string() }).optional(),
  minBearingLength: z.number().optional(),
  quasiWalls: z.boolean().optional(),
  foundation: z.object({ type: z.enum(['strip','mat','pile']), soilBearingKnM2: z.number().optional() }).optional(),  // 参考章用
}).optional()
```

### 5.3 `WallNode.jp`
```ts
jp: z.object({
  bearing: z.object({
    kinds: z.array(BearingKind).min(1),          // 併用は複数
    ratioOverride: z.number().min(0).max(7).optional(),
    faces: z.enum(['one','both']).optional(),
    quasi: z.object({ kind: z.enum(['panel','lath']), panelHeightRatio: z.number().min(0).max(1) }).optional(),
  }).optional(),
  exterior: z.boolean().optional(),              // 外壁（延焼ライン・外壁後退・見付面積の判定に使う。未指定なら外周判定）
}).optional()
```

### 5.4 `ZoneNode.jp`
```ts
jp: z.object({
  roomKind: z.enum(['living','non-living','kitchen','toilet','bath','stair','corridor','storage']).optional(),  // 居室=living
  daylightNeighborDistance: z.number().optional(),   // 採光補正係数 d（隣地境界までの水平距離）の手入力
}).optional()
```

### 5.5 既存ノードの流用
- `LevelNode.height`（階高）、`WallNode.start/end/thickness/height`、ドア・窓 `position[0]`（壁始点からの u）・`width`・`height`、`RoofSegmentNode.pitch/overhang` と屋根ジオメトリ、`ZoneNode.polygon/ceilingHeight`、`StairNode`（蹴上・踏面・幅はシステムの計測関数 `measureStair` を使う）、`ColumnNode`（位置・断面）、`SiteNode.polygon/northRotation`。
- 柱・筋かいを 3D に描くことはフェーズA の対象外（壁の属性として持つ）。

---

## 6. 構造計算の仕様（フェーズA・`packages/kenchiku/src/structural/`）

### 6.1 幾何の取り出し（アダプタ `packages/core/src/kenchiku/adapter.ts`）
1. **建物座標系**: `BuildingNode.rotation[1]` を戻した平面で評価。X方向 = x 軸、Y方向 = z 軸（符号は気にしない）。
2. **階**: 占有階（roof-only／support level を除く）を下から 1,2,3。階高は `getStoredLevelHeight`／`getLevelFloorToFloorHeight`（`services/storey.ts`）。
3. **床面積ポリゴン（壁芯）**: その階の壁の参照線（`wall-frame.ts` の中心線に正規化）でできる最外周ループ。`lib/room-graph.ts` の部屋抽出が壁面基準なら、部屋の union を壁厚/2 だけ外側へオフセットして近似する。どちらを使ったかを explain に残す。吹抜け（`floor-opening`）は穴。誤差 ±1% を許容し図書に注記。
4. **壁の方向判定**: 壁の角度が X 軸から ±22.5° 以内なら X、Y 軸から ±22.5° 以内なら Y、それ以外は「斜め壁（集計外）」として件数を報告。
5. **耐力壁区間**: `jp.bearing` が設定された壁について、開口（ドア・窓・`openingKind: 'opening'`、`floorThreshold` に関わらず）を壁始点からの区間 `[u−w/2, u+w/2]` で引き、残った区間のうち `minBearingLength` 以上を耐力壁区間とする。曲面壁（`curveOffset`）は集計外。
6. **見付面積**: 階 i・方向 d について、床面 + 1.35m より上の、方向 d から見た鉛直投影面積。壁は各階の床面積ポリゴンの d 方向の広がり × (階の上端 − 切断高さ)、屋根は roof-segment の頂点を投影してシルエットの多角形面積を求める（求められなければ切妻＝三角・寄棟＝台形・陸屋根＝0.15m の帯で近似し explain に明記）。内訳行（部位・幅・高さ・面積）を返す。
7. **屋根の諸元**: `rise`（最高高さ − 軒高）・`overhang`・`pitchSun = tan(pitch°)×10` を roof-segment から取り、`BuildingNode.jp.*Override` があればそれを優先。

### 6.2 地震力に対する必要壁量（公式表計算ツールと同一の式・丸め）
記号: h1/h2 階高(m)、rise、ov 軒の出(m)、p 勾配(寸)、Af1/Af2 床面積(㎡)、r = Af2/Af1。

1. 屋根面積割増係数 `Z2 = (16.5+2·ov)(6+2·ov)·√(p²+10²) / (16.5·6) / 10`
2. 壁荷重の床面積換算（10N単位切上げ）: `perFloorWall(w, h) = ceil10( w · ((6·h·2 + 16.5·h·2)·(1−0.09) / (6·16.5)) )`、開口: `perFloorOpening(h) = ceil10( 400 · ((6·h·2 + 16.5·h·2)·0.09 / (6·16.5)) )`
3. 壁荷重(kN/㎡) `Wwall(h) = ( perFloorWall(G2,h) + 200·h/2.8 + perFloorWall(D3,h) + perFloorOpening(h) ) / 1000`
4. 2階建て（kN per 1階床面積㎡）:
   - ① 屋根 `Wroof = ((G1·Z2 + D2·Z2)·r + D1·r)/1000`
   - ② 2階壁 `Wwall2 = Wwall(h2)·r`、③ 2階床 `Wfloor2 = (610 + P1)·r/1000`、④ 1階壁 `Wwall1 = Wwall(h1)`、⑤ 下屋 `Wlean = r<1 ? (1−r)(G1·Z2 + D1 + D2·Z2)/1000 : 0`
   - 2階が支える `W2 = Wroof + 0.5·Wwall2`、1階が支える `W1 = Wroof + Wwall2 + Wfloor2 + 0.5·Wwall1 + Wlean`
   - 高さ `h = rise/2 + h2 + h1 + 0.5`、`T = 0.03h`、`α2 = W2/W1`、`A2 = 1 + (1/√α2 − α2)·2T/(1+3T)`
   - `Lw1 = ceil( C0·Rt·W1 / 0.0196 )`、`Lw2 = ceil( A2·C0·Rt·W2 / 0.0196 / r )`
5. 平屋: `Wroof = (G1·Z2 + D2·Z2 + D1)/1000`、`W1 = Wroof + 0.5·Wwall(h1)`、`h = rise/2 + h1 + 0.5`、`Lw1 = ceil(C0·Rt·W1/0.0196)`
6. 必要壁量(cm) ＝ Lw × 当該階床面積。参考値として耐震等級2/3（×1.25／×1.5、多雪は積雪 `depth×unit×0.35×Z2/√(p²+10²)·10` を屋根に加算）も返す（図書では「参考（品確法）」）。
7. 3階建て・300㎡超・16m超・階高が極端な場合は `AgentRefusal`／エラー（フェーズB）。

**照合**: `docs/nsfactory/data/kenchiku_vectors.json` の `official_example`（h 3.0/3.0、rise 0.5、C0 0.2、Af 60/60、ov 0.5、4寸、スレート、サイディング、太陽光あり）で **Lw1 = 44、Lw2 = 25** になること。他4ケースも一致させる。

### 6.3 風圧力に対する必要壁量
`reqWind(i,d) = windCoef × facadeArea(i,d)`（cm）。見付面積の内訳を返す。

### 6.4 存在壁量
`exist(i,d) = Σ 区間長さ(cm) × 倍率`（αh・上限7.0／5.0 適用後）。壁ごとの内訳行（壁ID・方向・全長・開口合計・有効長・仕様・倍率・壁量）。準耐力壁等は別集計し 1/2 クランプ。

### 6.5 判定
各階・各方向: `exist ≥ max(reqQuake, reqWind)`。充足率 = exist / 必要。X・Y 両方向・全階が適合で総合適合。

### 6.6 四分割法（告示1100号 第4・旧告示1352号）
方向 d ごとに、床面積ポリゴンの d に直交する軸の広がりを4等分し、両側端の 1/4 の帯で床面積を切り出す（`polygon-boolean.intersection`）。側端の存在壁量は中点が帯に入る耐力壁区間の合計。`必要 = 側端床面積 × Lw(その階)`。充足率 r1, r2。判定: 両方 ≥ 1.0、または `壁率比 = min/max ≥ 0.5`。準耐力壁等が 1/2 以下なら耐力壁のみで判定（技術的助言 第4(4)）。偏心率を計算した場合（§6.9）に各階各方向 ≤ 0.3 なら四分割は省略可と表示。

### 6.7 N値計算
柱は (a) `ColumnNode` があればそれ、(b) 無ければ耐力壁区間の両端点（0.15m 以内は同一柱に併合）。出隅 = 床面積ポリゴンの凸頂点から 0.3m 以内。A1 = その柱に取り付く軸組の両側の倍率差（X・Y それぞれ求め大きい方の N を採用）、2階建て1階は上階の同位置（0.3m 以内）の柱の A2 を加える。式・係数は §4.3。金物区分と N を柱ごとの表で返し、`H0 > 3.2m` の階は注記。

### 6.8 柱の小径（令43条・告示1349号・公式ツール 2-1/2-2 と同式）
- 横架材間距離 `l`(mm): 2階建ての1階 `h1·1000 − 120`、2階および平屋 `h·1000 − 105`。
- 柱の負担荷重(kN/㎡・積載は柱算定用 1300/1800): 2階外周柱 `Wroof' + 0.5·Wwall2'`、1階外周柱 `Wroof' + Wwall2' + Wfloor2' + Wlean' + 0.5·Wwall1'`（`'` は r を掛けない床面積あたり値）。内部柱は外壁分を内壁分（200·h/2.8）に置き換える。
- `a = √( w·Ae / (Kd/3·Fc) · 1000 )`（mm）、`y = l/52.7`、`z = l/8.66`
  - `y > a` → `de = (12·l²/3000·a²)^(1/4)`；`z < a` → `de = a`；それ以外 → `de = l/75.05 + √((l/75.05)² + a²/1.3)`。切上げ整数。
- 細長比: `de_s = ceil(√12·l/150)`。必要小径 `= max(de, de_s)`。表示 `de/l = 1/floor(l/de·10)/10`。
- 柱ノードがあれば実寸と比較して判定。照合: `official_example` で 2階 84mm（1/34.4）、1階 105mm（1/27.4）。
- 隅柱は通し柱または同等補強（令43条5項）を注記。

### 6.9 参考機能（フェーズA後半・図書では「参考」章・判定の総合には含めない）
偏心率（剛心・重心・ねじり剛性、Re ≤ 0.3）、横架材の梁せい目安（旧 structure.js のスパン表）、基礎の接地圧略算（告示1347号の地耐力区分 20/30 kN/㎡ と形式の目安）。旧実装を移植してよいが、出典と「略算」を explain に明記。

---

## 7. 建築法チェック（構造以外・`packages/kenchiku/src/code-check/`）
入力は `JpSiteInput`（敷地ポリゴン・道路・用途地域等）と `JpBuildingInput`。各チェックは `{ id, title, law, article, url, status: 'ok'|'ng'|'warn'|'n/a'|'input-needed', measured, limit, explain }` を返す。入力が無いものは `input-needed` として表示し、**無理に判定しない**。

| id | 内容 | 判定 | 必要入力 |
|---|---|---|---|
| `site.road` | 接道（幅員4m以上の道路に2m以上） | 接道辺の長さ合計 ≥ 2.0 かつ 幅員 ≥ 4.0 | roads |
| `site.kenpei` | 建ぺい率 | 建築面積（1階壁芯ポリゴン＋1m超の軒の出）/敷地面積 ≤ 指定＋角地10 | kenpeiPct |
| `site.yoseki` | 容積率 | 延べ面積/敷地面積 ≤ min(指定, 前面道路幅員×0.4[住居系]/0.6) | yosekiPct, roads, zoning |
| `site.height` | 絶対高さ | 最高高さ ≤ 10/12 | absoluteHeightLimit |
| `site.setback` | 外壁後退 | 外壁〜敷地境界 ≥ 1.0/1.5 | wallSetback |
| `site.roadSlope` | 道路斜線 | 建物外形の各点で 高さ ≤ 1.25×(道路反対側境界までの水平距離)（住居系・適用距離20m・後退緩和あり） | roads, zoning |
| `site.northSlope` | 北側斜線 | 低層 5m+1.25×真北方向距離 | zoning, northRotation |
| `site.neighborSlope` | 隣地斜線 | 20m+1.25L（住居系）。2階建てでは通常 n/a | zoning |
| `site.shadow` | 日影 | 軒高7m超または3階以上のとき対象（フェーズAは対象判定のみ） | shadowRegulation |
| `site.fire` | 延焼のおそれのある部分 | 隣地境界・道路中心から 1階3m／2階5m 以内の開口に防火設備が必要（該当開口を列挙） | fireZone |
| `room.daylight` | 採光（法28条・令20条） | Σ(窓面積×採光補正係数) ≥ 床面積/7（住居系 A = d/h×6−1.4、工業 ×8−1.0、商業 ×10−1.0、上限3.0、d は隣地境界までの距離） | roomKind=living, daylightNeighborDistance |
| `room.ventilation` | 換気（法28条2項） | 開放可能な開口 ≥ 床面積/20（窓の `openableArea` 無ければ窓面積×0.5 と仮定し warn） | rooms |
| `room.ceiling` | 天井高（令21条） | ceilingHeight ≥ 2.1 | rooms |
| `room.stair` | 階段（令23条・住宅） | 蹴上 ≤ 23cm、踏面 ≥ 15cm、幅 ≥ 75cm | stairs |
| `room.floorHeight` | 床高（令22条） | 1階床 ≥ 地盤+45cm（べた基礎等の防湿措置があれば n/a） | 1階 slab 標高・foundation |
| `room.kitchenFinish` | 火気使用室の内装制限（令128条の4） | 2階建ての1階の kitchen に warn | roomKind |
| `energy.required` | 省エネ適合義務（2025-04〜） | 常に「仕様基準または計算が必要」を表示し、仕様基準の代表値（4〜7地域: 天井R≥4.0、壁R≥2.2、窓U≤4.7 等）をチェックリストで出す | energyRegion |
| `procedure` | 手続き | 新2号/新3号の区分、審査日数、提出先（印西市は2階以下・300㎡以下・16m以下→市）を表示 | authority |

---

## 8. 図書の生成（`packages/kenchiku/src/documents/`・HTML 文字列を返す純関数。editor は Blob URL で新しいタブに開き、ブラウザの印刷で PDF 化）
共通: A4 縦、`@page` 設定、冒頭に免責（§0.4）、基準日（知識テーブルの施行日）、建物名称・所在地・作成日、ページ番号。文字は日本語のシステムフォント。`document.write` は使わない。

| No | 図書 | 内容 | 根拠 |
|---|---|---|---|
| D1 | 壁量計算書 | 建物概要・荷重諸元・Lw 算定過程（式と代入値）・床面積表・見付面積表（内訳）・必要壁量・存在壁量内訳（壁ごと）・判定・準耐力壁割合・耐震等級参考値 | 令46条4項・告示1100号 |
| D2 | 四分割法検討書 | 側端部分の床面積根拠図（SVG）・存在壁量・充足率・壁率比・判定 | 告示1100号第4 |
| D3 | N値計算書 | 柱ごとの A1/A2/B/L/N・金物区分・柱位置図（SVG） | 告示1460号 |
| D4 | 柱の小径計算書 | 階ごとの l・負担荷重・Fc・必要小径・de/l・細長比・実寸との比較 | 令43条・告示1349号 |
| D5 | 各階耐力壁配置図 | 平面に耐力壁区間を方向別に色分け、壁番号、四分割線、重心/剛心（§6.9 実施時） | 規則1条の3 |
| D6 | 面積表・求積図 | 各階床面積（壁芯ポリゴンの三斜または座標法の表）、建築面積、延べ面積 | 規則1条の3 |
| D7 | 建築法チェック結果 | §7 の全項目を表で（status・測定値・基準・条文リンク） | ― |
| D8 | 提出図書チェックリストと手続き | 規則1条の3の表（新2号木造）の図書一覧（本アプリで出せるもの／設計者が別途作るもの）、申請〜検査の流れ、窓口 | 規則1条の3・法6条 |
| D9 | 仕様表（雛形） | 令37〜49条の仕様（基礎・土台緊結・横架材・筋かい端部・火打・屋根ふき材・防腐防蟻）の記入欄と、本アプリで分かる値の自動記入 | 令36〜49条 |

旧 `report.js` の見た目（A4・見出し・表のスタイル）は流用してよい。

---

## 9. UI（`packages/editor`）
1. **サイドバー「建築法規」パネル**（アイコン `lucide:scale`）。タブ: ①敷地・建物の設定（§5.1/5.2 のフォーム。未入力は空で可）②耐力壁（階ごとの壁一覧と仕様の一括設定・選択中の壁の仕様）③計算結果（判定サマリー・各階各方向の表・警告）④図書（D1〜D9 を開くボタン）。
2. **壁インスペクタ**に「耐力壁の仕様」セレクト（`packages/nodes/src/wall` の parametrics）。
3. **平面図オーバーレイ**: 耐力壁区間を X=青・Y=緑で描く（表示切替あり）。3D は壁上面に同色の帯（E-006）。
4. 計算は明示ボタン「計算する」で実行し、結果はストア（editor 側の Zustand）に保持。シーン変更で「古い結果」バッジ。
5. すべての判定に条文リンク（§4.5）。学習用に「式を表示」トグルで explain を展開。
6. 静的版の `scenes` 保存（IndexedDB）に `jp` フィールドが保存・復元されること（スキーマが optional なので自動）。

---

## 10. エージェント面（MCP／チャット・`agent-surfaces.md` のパリティ）
| ツール | 種別 | 入力 | 出力 |
|---|---|---|---|
| `jp_structural_check` | 読み取り | `{ buildingId? }` | §6 の全結果（判定・数値・explain・警告） |
| `jp_building_code_check` | 読み取り | `{ buildingId? }` | §7 の結果一覧 |
| `jp_set_wall_bearing` | 書き込み | `{ wallIds: string[]; kinds: BearingKind[]; ratioOverride? }` | 更新した壁の一覧 |
| `jp_get_documents` | 読み取り | `{ doc: 'D1'..'D9' }` | HTML 文字列（長いので MCP では長さと先頭のみ＋保存パス） |
契約は `packages/core/src/agent-tools/kenchiku.ts`、操作は `packages/core/src/agent-operations/kenchiku.ts`（`AGENT_OPERATIONS` に登録）、MCP 登録は `packages/mcp` の既存ツール登録箇所に倣う。`skills/pascal-3d` の参照に「日本の建築法規チェック」の一節を足す。

---

## 11. テスト（T-001）
| 対象 | テスト | 期待値の出所 |
|---|---|---|
| `kenchiku` 必要壁量・柱小径 | `kenchiku_vectors.json` の全ケース（Lw1/Lw2・柱 de・A2・W1/W2 を小数4桁で） | 公式ツール（Claude 照合済み） |
| `kenchiku` 存在壁量 | 10m の壁に 1.8m の開口1つ（u=5.0）→ 区間 4.1m＋4.1m、倍率2.5 → 2050cm。0.8m 区間は不算入。併用 4.0+4.0 → 7.0 にクランプ、90角たすき+2.0 → 5.0 | 手計算 |
| `kenchiku` 四分割 | 10m×8m 矩形（X方向の壁を検討・直交軸 8m を4等分 → 両端帯は 2.0m×10m = 20㎡）・Lw=30 → 側端の必要壁量 600cm。側端の壁が 375cm/750cm → 充足率 0.625/1.25、壁率比 0.5 → 適合（2026-10-07 訂正: 旧記載の 16㎡ は誤り） | 手計算 |
| `kenchiku` N値 | 2階建て1階・一般柱・A1=2.5・A2=2.5 → N=0.9 → 「は」；出隅 A1=5 単独最上階 → N=3.6 → 「ち」 | 手計算 |
| `kenchiku` 風 | 見付面積 40㎡×50 = 2000cm、係数75 → 3000cm | 手計算 |
| `kenchiku` code-check | 各チェックの境界値（例: 床面積 14㎡の居室に窓 2.0㎡・A=1.0 → 1/7 = 2.0 でOK、1.99でNG） | 手計算 |
| core アダプタ | fixture シーン（2階建て 7.28m×9.1m の矩形、各階4外壁＋間仕切2、各外壁に窓）→ 床面積 66.25㎡（±1%）、X/Y の壁本数、開口を引いた区間長、階高、屋根諸元 | 手計算 |
| core スキーマ | `jp` 無しの旧シーン JSON が parse でき、`jp` 付きが往復保存できる | ― |
| editor | パネルが描画され「計算する」で結果が出る（既存の UI テストの流儀に倣う。無ければ省略可） | ― |
| 全体 | `bun run ci` 成功、`bun run build:static` 成功 | ― |

---

## 12. 受け入れ基準（完了の定義）
1. `bun run ci` が exit 0（check・skills:validate・check-types・test・build）。
2. `cd apps/editor && bun run build:static` が exit 0。
3. `kenchiku_vectors.json` の全ケースがテストで一致。
4. fixture シーンで D1〜D9 の HTML が生成され、D1 に「必要壁量」「存在壁量」「判定」の表が含まれる。
5. エディタのパネルから設定→計算→図書を開く操作が通る（Claude がプレビューで目視）。
6. MCP の `jp_structural_check` が fixture シーンで結果 JSON を返す。
7. 旧シーン（`jp` なし）が読み込める。

---

## 13. 実装の区切り（Codex 用・各 STEP の完了条件とテスト）
> 共通: 開発サーバーを起動しない。コミットしない（Claude が検証後にコミット）。各 STEP の終わりに `bun run check` と `bun test kenchiku` を通す。分からない仕様は推測で埋めず `// TODO(spec §x.y)` を残して報告する。

- **STEP 1** `packages/kenchiku` 新設（package.json・tsconfig・index）、知識テーブル（§4.1・4.2・4.4・4.5、timber-fc 取り込み）、§6.2・6.3・6.8 の純関数、オラクル照合テスト。完了: vectors 全一致。
- **STEP 2** §6.4〜6.7（存在壁量・判定・四分割・N値）と §11 の手計算テスト。完了: 手計算テスト全通過。
- **STEP 3** スキーマ拡張（§5）＋アダプタ（§6.1）＋ fixture シーン＋アダプタテスト。`architecture.test.ts`/biome の依存許可。完了: 旧シーン互換テストとアダプタテスト通過、`bun run check-types` 通過。
- **STEP 4** §7 法規チェック（純関数＋アダプタの敷地入力）＋テスト。
- **STEP 5** §8 図書 D1〜D9 の HTML 生成関数＋存在確認テスト（キー文字列）。
- **STEP 6** §9 UI（パネル・壁インスペクタ・平面図オーバーレイ・i18n）。
- **STEP 7** §10 エージェントツール＋ MCP 登録＋パリティ表更新＋ skills 追記。
- **STEP 8** §6.9 参考機能（偏心率・横架材・基礎）＋ docs（`wiki/architecture/` に `kenchiku.md` を追加、CHANGELOG）＋ `bun run ci` と `build:static` の最終確認。

---

## 14. フェーズB・C ロードマップ（本書では実装しない）
- **B 木造3階建て／300㎡超**: 許容応力度計算（令82条・告示1899号ルート1）。部材モデル（柱・梁・基礎・接合部）と荷重拾い、応力計算は外部の構造計算ソフトとの**データ連携**（数量・架構の JSON/CSV 出力）を先に作り、自前計算は後。13m超16m以下は剛性率・偏心率の確認。
- **C 鉄骨・RC**: `BuildingNode.jp.structure` の切替で木造の仕様規定チェックを無効化し、構造種別ごとの提出図書リスト（規則1条の3）と構造計算適合性判定の要否判定を先に提供。計算本体は外部連携。
- **共通**: GIS（国土数値情報 A55）取り込み、J-SHIS 表示、省エネの WEB プログラム入力値の書き出し、日影図、天空率。

---

## 15. 未決事項・リスク
| 事項 | 現状 | 対応 |
|---|---|---|
| N値の筋かい補正値表 | 告示PDFの表が画像で未抽出 | Claude が一次資料で照合し `n-value-tables.json` を用意。届くまで補正 0 で実装し TODO |
| 風圧区域（50〜75）と令88条2項区域（C0=0.3）の該非 | 特定行政庁の指定による | 入力項目にし、既定 50／0.2。印西市は要確認 |
| 床面積の壁芯評価 | room-graph が壁面基準か未確認 | §6.1(3) の代替手順。±1% を図書に注記 |
| 見付面積の屋根投影 | 複雑な屋根は近似 | explain に近似方法を明記 |
| 準耐力壁等の UI | 仕様が多い | フェーズAは最小限（算入チェックと面材種別） |
| 日影・天空率 | 対象判定のみ | フェーズ後続 |
| 日本語 PDF | HTML印刷で代替 | 要望があれば Noto Sans JP サブセット＋pdfkit |

---

## 付録A 出典
- 国交省 技術的助言 国住指第425号（2025）: https://www.mlit.go.jp/common/001877517.pdf
- 国交省 補足資料「壁量基準の見直し」R6.7.8: https://www.mlit.go.jp/jutakukentiku/build/content/001753667.pdf
- 令和7年国土交通省告示第215号: https://www.mlit.go.jp/jutakukentiku/build/content/001879919.pdf
- HOWTEC 設計支援ツール（表計算ツール・早見表）: https://www.howtec.or.jp/publics/index/411/
- 建築基準法施行令（e-Gov・2025-12-01 版）: https://laws.e-gov.go.jp/law/325CO0000000338 、API 例 `https://laws.e-gov.go.jp/api/2/law_data/325CO0000000338?response_format=json&elm=MainProvision-Article_46`
- 建築基準法施行規則（提出図書・規則1条の3）: https://laws.e-gov.go.jp/law/325M50004000040
- 平成12年建設省告示第1460号: https://www.mlit.go.jp/jutakukentiku/build/s20000523/n026.pdf ／ 第1352号: https://www.mlit.go.jp/notice/noticedata/pdf/201703/00006444.pdf ／ 第1347号: https://www.mlit.go.jp/notice/noticedata/pdf/201703/00006441.pdf
- 2025年4月改正 公式ハブ: https://www.mlit.go.jp/jutakukentiku/build/r4kaisei_shoenehou_kijunhou.html ／ 省エネ特設: https://www.mlit.go.jp/shoene-jutaku/
- 印西市（限定特定行政庁・確認申請）: https://www.city.inzai.lg.jp/0000000193.html ／ https://www.city.inzai.lg.jp/0000000151.html ／ 基準値 https://www.city.inzai.lg.jp/cmsfiles/contents/0000000/145/seigenn.pdf
- 千葉県 中間検査: https://www.pref.chiba.lg.jp/kenchiku/jigyousha/kenchiku/kijunhou/chuukan/tyuukan-r04.html
- 国土数値情報 A55: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A55-2024.html ／ J-SHIS API: https://www.j-shis.bosai.go.jp/en/api-list

## 付録B 旧ツールからの移植可否
`kabe.js` の区間分割・見付面積の考え方・`report.js` の帳票スタイル・`structure.js` の偏心率/N値/梁せい/基礎は TypeScript へ移植可。係数表（QUAKE_COEF）と全壁一律倍率は破棄。
