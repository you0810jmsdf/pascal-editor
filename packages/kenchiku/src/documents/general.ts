import { buildingAreaPolygon, totalFloorArea } from '../code-check/geometry'
import type { CheckStatus } from '../code-check/types'
import type { Pt } from '../model'
import { signedArea } from '../structural/polygon'
import { type DocumentMeta, esc, n, note, page, planSvg, section, table } from './html'
import type { KenchikuResults } from './results'

const STATUS_LABEL: Record<CheckStatus, string> = {
  ok: '<span class="ok">適合</span>',
  ng: '<span class="ng">不適合</span>',
  warn: '<span class="warn">要確認</span>',
  'n/a': '<span class="na">対象外</span>',
  'input-needed': '<span class="need">入力待ち</span>',
}

/** D6 面積表・求積図 */
export function d6AreaTable(r: KenchikuResults, meta: DocumentMeta): string {
  const storeys = r.input.storeys
  const coordinateRows = (poly: Pt[]) =>
    poly.map((p, i) => {
      const q = poly[(i + 1) % poly.length]!
      return [`P${i + 1}`, n(p[0], 3), n(p[1], 3), n(p[0] * q[1] - q[0] * p[1], 4)]
    })
  const footprint = buildingAreaPolygon(r.input)
  const body = [
    section(
      '1. 面積表',
      table(
        ['区分', '面積 (㎡)', '備考'],
        [
          ...storeys.map((s) => [
            `${s.index}階 床面積`,
            n(s.floorArea),
            s.holes?.length ? `吹抜け ${s.holes.length} 箇所を控除` : '',
          ]),
          ['延べ面積', n(totalFloorArea(r.input)), '各階床面積の合計'],
          [
            '建築面積（近似）',
            n(footprint.area),
            '各階の壁芯外周のうち最大。1m を超える軒の出・バルコニーは未考慮',
          ],
        ],
        { numeric: [1] },
      ) +
        note(
          '床面積は壁その他の区画の中心線（壁芯）で囲まれた水平投影面積（令2条1項3号）。座標法で算出し、許容誤差 ±1%。',
        ),
    ),
    ...storeys.map((s, i) =>
      section(
        `${i + 2}. ${s.index}階 求積図（座標法）`,
        planSvg(s, { labelVertices: true, showWallIds: false }) +
          table(
            ['点', 'x (m)', 'y (m)', 'x_i·y_{i+1} − x_{i+1}·y_i'],
            [
              ...coordinateRows(s.floorPolygon),
              ['合計 ÷ 2 = 面積', '', '', n(Math.abs(signedArea(s.floorPolygon)), 3)],
            ],
            { numeric: [1, 2, 3] },
          ) +
          (s.holes ?? [])
            .map((h, k) =>
              table(
                ['吹抜け', 'x', 'y', '項'],
                [...coordinateRows(h), [`穴${k + 1} 面積`, '', '', n(Math.abs(signedArea(h)), 3)]],
                { numeric: [1, 2, 3] },
              ),
            )
            .join(''),
        true,
      ),
    ),
  ].join('')
  return page(
    '面積表・求積図',
    '建築基準法施行令第2条・施行規則第1条の3（床面積求積図）',
    meta,
    body,
  )
}

/** D7 建築法チェック結果 */
export function d7CodeCheck(r: KenchikuResults, meta: DocumentMeta): string {
  const checks = r.code.value.checks
  const counts = r.code.value.counts
  const group = (prefix: string) => checks.filter((c) => c.id.startsWith(prefix))
  const rows = (list: typeof checks) =>
    table(
      ['項目', '判定', '実測・内容', '基準', '条文'],
      list.map((c) => [
        `${esc(c.title)}<br><span class="note">${esc(c.message)}</span>`,
        STATUS_LABEL[c.status],
        esc(c.measured ?? '－'),
        esc(c.limit ?? '－'),
        c.explain.references
          .map(
            (ref) =>
              `<a href="${esc(ref.url)}" target="_blank" rel="noopener">${esc(ref.law)} ${esc(ref.article)}</a>`,
          )
          .join('<br>'),
      ]),
    )
  const body = [
    section(
      '1. 集計',
      table(
        ['適合', '不適合', '要確認', '対象外', '入力待ち'],
        [[counts.ok, counts.ng, counts.warn, counts['n/a'], counts['input-needed']]],
        { numeric: [0, 1, 2, 3, 4] },
      ) +
        note(
          '要確認＝判定はしたが人の確認や追加の検討が要る項目。入力待ち＝敷地情報などが無く判定していない項目（無理に判定しない）。',
        ),
    ),
    section('2. 敷地・集団規定', rows(group('site.'))),
    section('3. 居室・単体規定', rows(group('room.')), true),
    section('4. 省エネ・手続き', rows([...group('energy.'), ...group('procedure')])),
  ].join('')
  return page(
    '建築法チェック結果',
    '建築基準法（集団規定・単体規定）・建築物省エネ法・手続き',
    meta,
    body,
  )
}

/** D8 提出図書チェックリストと手続き */
export function d8Checklist(r: KenchikuResults, meta: DocumentMeta): string {
  const procedure = r.code.value.checks.find((c) => c.id === 'procedure')
  const twoStorey = r.input.storeys.length >= 2 || totalFloorArea(r.input) > 200
  const docs: [string, string, string, string][] = [
    ['付近見取図', '方位・道路・目標となる地物', '－', '設計者（地図）'],
    [
      '配置図',
      '縮尺・方位・敷地境界・建物位置・高低差・道路幅員・排水',
      '敷地情報（D7 の入力値）',
      '設計者',
    ],
    [
      '各階平面図',
      '間取・用途・床面積・壁及び筋かいの位置と種類・通し柱・開口部',
      '平面図PDF（エディタの平面図書き出し）＋ D5',
      '設計者（記名）',
    ],
    ['床面積求積図', '求積の根拠', 'D6', '－'],
    [
      '2面以上の立面図・断面図',
      '部材の位置・寸法・開口部、床・天井の高さ',
      '－（3D からの書き出しは今後）',
      '設計者',
    ],
    [
      '基礎伏図・各階床伏図・小屋伏図・2面以上の軸組図',
      '部材の種別・寸法・位置（特定木造建築物は仕様表で代替可）',
      'D9（仕様表の雛形）',
      '設計者 / プレカット',
    ],
    [
      '構造詳細図',
      '縮尺・材料の種別寸法・屋根ふき材・軸組等の構造方法・基礎（令38条3項）',
      'D9',
      '設計者',
    ],
    ['各階耐力壁図', '耐力壁の位置・種類・倍率', 'D5', '－'],
    [
      '壁量計算書',
      '床面積表・見付面積表・係数・必要壁量・存在壁量・判定・準耐力壁等の割合',
      'D1',
      '－',
    ],
    ['四分割法の面積根拠図・計算表', '側端部分の床面積・存在壁量・充足率・壁率比', 'D2', '－'],
    [
      '柱頭柱脚金物算定平面図・N値表',
      '柱ごとの N 値と接合金物',
      'D3',
      '－（金物製品の選定は設計者）',
    ],
    ['柱の小径の検討', '横架材間距離・小径・樹種', 'D4', '－'],
    [
      '使用建築材料表（法37条）',
      '構造耐力上主要な部分の材料の種別・JIS/JAS',
      'D9（記入欄）',
      '設計者',
    ],
    [
      '仕様表（令37〜49条）',
      '基礎・土台緊結・横架材・筋かい端部・火打・屋根ふき材・防腐防蟻',
      'D9',
      '設計者',
    ],
    [
      '省エネ関係図書',
      '設計内容説明書・仕様基準の確認図書または計算書',
      '－',
      '設計者（建築研究所プログラム等）',
    ],
    ['建築計画概要書・建築工事届・委任状', '法定様式', '－', '建築主・設計者'],
  ]
  const body = [
    section(
      '1. 区分と手続き',
      `<p>${esc(procedure?.message ?? '')}</p>${note(procedure?.measured ?? '')}` +
        table(
          ['段階', '内容'],
          [
            [
              '1 事前協議',
              '用途地域・道路種別・防火指定・各種条例（景観・開発）の確認。印西市は国道464号沿道などで景観届出が要る場合あり',
            ],
            [
              '2 確認申請',
              `${twoStorey ? '新2号建築物：構造関係図書・省エネ図書を添付して提出（審査35日以内）' : '新3号建築物：構造審査は省略（審査7日以内）。壁量計算自体は令46条4項により必要'}`,
            ],
            ['3 確認済証', '交付後に着工。計画変更は変更申請'],
            [
              '4 中間検査',
              '特定行政庁の指定による。千葉県の指定では非分譲の木造2階建ては対象外（分譲は100㎡超で対象）。工程は小屋組・軸組',
            ],
            ['5 完了検査', '工事完了から4日以内に申請。検査済証の交付後に使用開始'],
            [
              '6 その他',
              '建築工事届（10㎡超・建築主→知事）、建築計画概要書（閲覧対象）、長期優良住宅・性能表示は任意',
            ],
          ],
        ),
    ),
    section(
      '2. 提出図書チェックリスト（規則第1条の3・木造2階建て住宅）',
      table(['図書', '明示すべき事項', '本アプリの出力', '別途作成'], docs) +
        note('「本アプリの出力」は参考資料。設計図書として提出するには建築士の確認・記名が必要。'),
      true,
    ),
  ].join('')
  return page('提出図書チェックリストと手続き', '建築基準法第6条・施行規則第1条の3', meta, body)
}

/** D9 仕様表（令37〜49条）の雛形 */
export function d9SpecSheet(r: KenchikuResults, meta: DocumentMeta): string {
  const kinds = new Set<string>()
  for (const s of r.walls.value.storeys)
    for (const g of s.value.segments)
      kinds.add(
        g.value.spec.kind === 'combined'
          ? (g.value.spec.components ?? []).map((c) => c.kind).join('+')
          : g.value.spec.kind,
      )
  const de = r.columns.value.storeys
    .map(
      (s) =>
        `${s.value.index}階 外周 ${s.value.exterior.value.de}mm / 内部 ${s.value.interior.value.de}mm`,
    )
    .join('、')
  const ROOF = { tile: '瓦屋根（ふき土無）', slate: 'スレート屋根', metal: '金属板ぶき' } as const
  const EXT = {
    earthen: '土塗り壁等',
    mortar: 'モルタル等',
    siding: 'サイディング',
    metal: '金属板張',
    board: '下見板張',
  } as const
  const rows: [string, string, string, string][] = [
    [
      '基礎（令38条・告示1347号）',
      '地盤の長期許容応力度と基礎形式（20kN/㎡未満：杭、20〜30：杭またはべた基礎、30以上：杭・べた・布）。べた基礎：立上り地上30cm以上・厚12cm・底盤12cm・根入れ12cm以上、主筋D12、縦筋D10@300以下',
      '',
      '地盤調査結果・基礎形式・配筋',
    ],
    [
      '土台（令42条）',
      '土台はアンカーボルト等で基礎に緊結。防腐措置',
      '',
      'アンカーボルト径・間隔',
    ],
    [
      '柱の小径（令43条・告示1349号）',
      `必要小径（本アプリ）：${de}。有効細長比150以下。隅柱は通し柱または同等補強`,
      de,
      '樹種・等級・実寸',
    ],
    ['横架材（令44条）', '欠込みは構造耐力上支障のない位置と大きさ', '', '梁せい・継手位置'],
    [
      '筋かい（令45条）',
      '引張筋かいは厚さ1.5cm×幅9cm以上、圧縮筋かいは3cm×9cm以上。端部は柱と横架材の仕口付近に金物で緊結。欠込み禁止',
      [...kinds].filter((k) => k.startsWith('brace')).join('、') || '筋かいなし',
      '筋かい金物',
    ],
    [
      '面材耐力壁（告示1100号）',
      '構造用合板等の種類・厚さ・釘種別・釘間隔',
      [...kinds].filter((k) => k.startsWith('panel')).join('、') || '面材なし',
      '釘仕様',
    ],
    [
      '火打材（令46条3項）',
      '床組・小屋ばり組に火打材または構造用面材で水平構面を確保',
      '',
      '火打材の位置',
    ],
    ['屋根ふき材（令39条・告示109号）', '緊結方法', ROOF[r.input.roof.kind], '緊結仕様'],
    [
      '外壁（令46条の考慮・法22条/61条）',
      '外壁材と防火性能',
      EXT[r.input.extWall],
      '防火構造の認定番号等',
    ],
    [
      '防腐・防蟻（令49条）',
      '地面から1m以内の木部は有効な防腐措置と必要に応じ防蟻措置',
      '',
      '薬剤・処理範囲',
    ],
    [
      '使用建築材料（法37条）',
      '構造耐力上主要な部分に用いる木材・鋼材・コンクリート等の JIS/JAS 適合',
      '',
      '材料表',
    ],
  ]
  const body = [
    section(
      '1. 仕様表（記入欄付き）',
      table(['項目（条文）', '基準の要点', '本アプリで分かる値', '設計者の記入欄'], rows) +
        note('本アプリで分かる値は参考。空欄は設計者が記入する。'),
    ),
    section(
      '2. 構造の概要',
      table(
        ['項目', '値'],
        [
          ['構造', `木造在来軸組・${r.input.storeys.length}階建て`],
          ['延べ面積', `${n(totalFloorArea(r.input))} ㎡`],
          ['耐力壁の仕様', [...kinds].join('、') || '（未設定）'],
          [
            '木材（柱）',
            `${r.input.timber.standard} ${r.input.timber.species} ${r.input.timber.grade}`,
          ],
        ],
      ),
    ),
  ].join('')
  return page(
    '仕様表（令第37条〜第49条）',
    '建築基準法施行規則第1条の3（構造詳細図・仕様表）',
    meta,
    body,
  )
}
