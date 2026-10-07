import { REFERENCES } from './references'

// 出典: docs/nsfactory/data/n-value-tables.json。原典照合状況も保持する。
// TODO(spec §4.3): 筋かい補正は元データの確信度 medium。公開前に告示本文で照合する。
// TODO(spec §4.3): ぬの名称・必要耐力が仕様書（25kN×2）とJSON（30kN）で異なる。原本を保持し要照合。
export const N_VALUE_TABLES = {
  source:
    '平成12年建設省告示第1460号 第2号 表三（接合方法の記号と N 値の区分）。区分のしきい値と必要耐力は金物メーカー資料（タナカ『告示1460号第2号に対応した柱接合金物』）で 2026-10-07 に照合済み。筋かいの補正値は告示の表が画像で機械抽出できず、設計実務の一般的な表から転記したもの（確信度: 中）。公開前に告示本文の表で照合すること。',
  formula: {
    top_or_single_storey: 'N = A1*B1 - L  (B1: 出隅 0.8 / その他 0.5, L: 出隅 0.4 / その他 0.6)',
    first_of_two_storeys:
      'N = A1*B1 + A2*B2 - L  (B2: 出隅 0.8 / その他 0.5, L: 出隅 1.0 / その他 1.6)',
    note: 'A1/A2 は柱の両側の軸組の倍率の差。筋かいの軸組は倍率に下の補正値を加えてから差をとる。横架材上端間距離が 3.2m を超える階は告示の表によれず N値計算法が必須（技術的助言 国住指第425号 第4(4)）。',
  },
  hardware: [
    { symbol: 'い', maxN: 0.0, requiredKn: 0.0, name: '短ほぞ差し・かすがい打ち（同等以上）' },
    {
      symbol: 'ろ',
      maxN: 0.65,
      requiredKn: 3.4,
      name: '長ほぞ差し込み栓打ち、またはL字型かど金物（CP-L）',
    },
    {
      symbol: 'は',
      maxN: 1.0,
      requiredKn: 5.1,
      name: 'T字型かど金物（CP-T）またはV字型山形プレート（VP）',
    },
    { symbol: 'に', maxN: 1.4, requiredKn: 7.5, name: '羽子板ボルト・短ざく金物' },
    {
      symbol: 'ほ',
      maxN: 1.6,
      requiredKn: 8.5,
      name: '羽子板ボルト・短ざく金物（スクリュー釘打ちあり）',
    },
    { symbol: 'へ', maxN: 1.8, requiredKn: 10.0, name: '引き寄せ金物 10kN（HD-B10 等）' },
    { symbol: 'と', maxN: 2.8, requiredKn: 15.0, name: '引き寄せ金物 15kN（HD-B15 等）' },
    { symbol: 'ち', maxN: 3.7, requiredKn: 20.0, name: '引き寄せ金物 20kN（HD-B20 等）' },
    { symbol: 'り', maxN: 4.7, requiredKn: 25.0, name: '引き寄せ金物 25kN（HD-B25 等）' },
    { symbol: 'ぬ', maxN: 5.6, requiredKn: 30.0, name: '引き寄せ金物 15kN×2（または 25kN 用 ×2）' },
    {
      symbol: '超過',
      maxN: null,
      requiredKn: null,
      name: '告示仕様外。N×5.3 kN の引張耐力を個別に確認（要構造設計者）',
    },
  ],
  braceCorrection: {
    confidence: 'medium',
    appliesTo: '片筋かい（1本）の軸組。たすき掛けは補正 0。',
    rule: '筋かいの上端が取り付く柱（柱頭側）には + の値、下端が取り付く柱（柱脚側）には − の値を倍率に加える。筋かいの向きが不明なときは安全側として両端の柱に + の値を用い、結果に『筋かいの向き未設定（安全側）』の注記を付ける。',
    values: [
      { kind: 'brace-15x90', topColumn: 0.0, bottomColumn: 0.0 },
      { kind: 'brace-30x90', topColumn: 0.5, bottomColumn: -0.5 },
      { kind: 'brace-45x90', topColumn: 0.5, bottomColumn: -0.5 },
      { kind: 'brace-90x90', topColumn: 2.0, bottomColumn: -2.0 },
      { kind: 'brace-15x90-x', topColumn: 0.0, bottomColumn: 0.0 },
      { kind: 'brace-30x90-x', topColumn: 0.0, bottomColumn: 0.0 },
      { kind: 'brace-45x90-x', topColumn: 0.0, bottomColumn: 0.0 },
      { kind: 'brace-90x90-x', topColumn: 0.0, bottomColumn: 0.0 },
    ],
  },
  corner: {
    rule: '出隅の柱 = 建物外周（床面積ポリゴン）の凸な頂点にある柱。2階建ての1階では『上階も当該階も出隅』『上階だけ出隅』『どちらも出隅でない』で B・L を使い分ける（告示 表三）。実装では当該階の柱の出隅判定で B1/L を、上階の柱の出隅判定で B2 を決める。',
  },
} as const
export const N_VALUE_REFERENCES = [REFERENCES.nValue, REFERENCES.guidance] as const
export const N_VALUE_COEFFICIENTS = {
  b: { corner: 0.8, other: 0.5 },
  topL: { corner: 0.4, other: 0.6 },
  firstL: { corner: 1, other: 1.6 },
} as const
