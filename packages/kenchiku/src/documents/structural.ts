import { LOADS } from '../knowledge/loads'
import type { Dir } from '../model'
import {
  cm,
  type DocumentMeta,
  dirLabel,
  esc,
  explainBlock,
  judge,
  n,
  note,
  page,
  pct,
  planSvg,
  section,
  table,
} from './html'
import type { KenchikuResults } from './results'

const ROOF = { tile: '瓦屋根（ふき土無）', slate: 'スレート屋根', metal: '金属板ぶき' } as const
const EXT = {
  earthen: '土塗り壁等',
  mortar: 'モルタル等',
  siding: 'サイディング',
  metal: '金属板張',
  board: '下見板張',
} as const
const PV = { none: 'なし', standard: 'あり（200 N/㎡）', custom: 'あり（任意入力）' } as const

function overview(r: KenchikuResults): string {
  const i = r.input
  return table(
    ['項目', '値', '項目', '値'],
    [
      [
        '構造・階数',
        `木造在来軸組・${i.storeys.length}階建て`,
        '床面積',
        i.storeys.map((s) => `${s.index}階 ${n(s.floorArea)}㎡`).join('　'),
      ],
      [
        '階高',
        i.storeys.map((s) => `${s.index}階 ${n(s.height)}m`).join('　'),
        '屋根',
        `${ROOF[i.roof.kind]}・勾配 ${n(i.roof.pitchSun, 1)}寸・軒の出 ${n(i.roof.overhang)}m・最高高さ−軒高 ${n(i.roof.rise)}m`,
      ],
      ['外壁', EXT[i.extWall], '太陽光発電設備等', PV[i.pv.kind]],
      [
        '断熱材',
        `天井 ${i.ceilingInsulationNPerM2} N/㎡・外壁 ${i.wallInsulationNPerM2} N/㎡`,
        '用途・積載',
        `${i.use === 'house' ? '住宅' : '事務所'}（${LOADS.liveSeismic[i.use]} N/㎡）`,
      ],
      ['標準せん断力係数 C0', String(i.c0), '風の係数', `${i.windCoef} cm/㎡`],
      [
        '木材（柱）',
        `${i.timber.standard} ${i.timber.species} ${i.timber.grade}（Fc ${i.timber.fc} N/mm²）`,
        '耐力壁の最小長さ',
        `${n(i.minBearingLength)}m`,
      ],
    ],
  )
}

/** D1 壁量計算書 */
export function d1WallQuantity(r: KenchikuResults, meta: DocumentMeta): string {
  const req = r.required
  const v = req.value
  const parts = v.parts as Record<string, number>
  const loadRows = [
    ['① 屋根（天井断熱・太陽光含む）', parts.roof],
    ['② 2階の壁（外壁・内壁・断熱・窓）', parts.wall2],
    ['③ 2階の床（床＋積載）', parts.floor2],
    ['④ 1階の壁', parts.wall1],
    ['⑤ 1階下屋の屋根', parts.lean],
  ].filter(([, x]) => x !== undefined)
  const body = [
    section('1. 建物概要', overview(r)),
    section(
      '2. 地震力に対する必要壁量（床面積に乗ずる数値 Lw）',
      `<h3>2-1 荷重の算定（kN/㎡・1階床面積あたり）</h3>${table(
        ['区分', 'kN/㎡'],
        loadRows.map(([k, x]) => [k as string, n(x as number, 4)]),
        { numeric: [1] },
      )}
${table(
  ['項目', '値'],
  [
    ['屋根面積の割増係数 Z2（軒の出・勾配）', n(v.z2, 4)],
    ['2階が支える荷重 W2', n(v.w2, 4)],
    ['1階が支える荷重 W1', n(v.w1, 4)],
    ['算定用建物高さ h（基礎・土台 0.5m 含む）', `${n(v.h)} m`],
    ['固有周期 T = 0.03h', n(v.t, 4)],
    ['α2 = W2/W1', n(v.alpha2 ?? null, 4)],
    ['層せん断力分布係数 A2', n(v.a2 ?? null, 4)],
    ['床面積比 r = Af2/Af1', n(v.r, 4)],
  ],
  { numeric: [1] },
)}
<h3>2-2 床面積に乗ずる数値と必要壁量</h3>
${table(
  ['階', '床面積 Af (㎡)', 'Lw (cm/㎡)', '必要壁量 Lw×Af (cm)'],
  r.input.storeys.map((s, i) => [`${s.index}階`, n(s.floorArea), cm(v.lw[i]), cm(v.requiredCm[i])]),
  { numeric: [1, 2, 3] },
)}
${note('Lw = (Ai・C0・Σwi)/(0.0196・Afi)。令46条4項・昭和56年建設省告示第1100号（令和7年4月1日施行の改正）。荷重の定数は国土交通省が技術的助言で使用可能と位置付けた表計算ツール（HOWTEC）と同じ。')}
${explainBlock(req.explain, '必要壁量の式と代入値')}`,
    ),
    section(
      '3. 風圧力に対する必要壁量（見付面積）',
      r.wind.value.rows
        .map((row) => {
          const f = row.value.facade
          return `<h3>${row.value.storey}階 ${dirLabel(row.value.direction)}</h3>${table(
            ['部位', '幅 (m)', '高さ (m)', '面積 (㎡)'],
            [
              ...f.parts.map((p) => [p.label, n(p.width), n(p.height), n(p.area)]),
              ['見付面積合計 S', '', '', n(f.area)],
              [`必要壁量 S × ${r.input.windCoef}`, '', '', `${cm(row.value.requiredCm)} cm`],
            ],
            { numeric: [1, 2, 3] },
          )}`
        })
        .join('') +
        note(
          '見付面積はその階の床面から 1.35m 以下の部分を除いた鉛直投影面積。係数は一般区域 50 cm/㎡（特定行政庁の指定区域は 50 超〜75）。',
        ),
      true,
    ),
    section(
      '4. 存在壁量（耐力壁の内訳）',
      r.walls.value.storeys
        .map(
          (s) =>
            `<h3>${s.value.storey}階（横架材上端間距離 Ho = ${n(s.value.ho)} m）</h3>${table(
              [
                '壁番号',
                '方向',
                '全長 (m)',
                '開口計 (m)',
                '有効長 (m)',
                '仕様（倍率）',
                '壁量 (cm)',
                '備考',
              ],
              s.value.walls.map((w) => {
                const segs = w.value.segments
                const spec = segs[0]?.value.spec
                const specLabel = spec
                  ? spec.kind === 'combined'
                    ? (spec.components ?? []).map((c) => c.kind).join('+')
                    : spec.kind
                  : '－'
                const ratio = segs[0]?.value.ratio
                return [
                  w.value.wallId.replace(/^wall_/, ''),
                  w.value.direction ? dirLabel(w.value.direction) : '斜め/曲面',
                  n(w.value.length),
                  n(w.value.openingLength),
                  n(w.value.effectiveLength),
                  spec ? `${specLabel}（${n(ratio, 2)}）` : '非耐力壁',
                  cm(segs.reduce((sum, g) => sum + g.value.wallCm, 0)),
                  w.value.excluded
                    ? `集計外（${w.value.excluded}）`
                    : segs.some((g) => g.value.quasi)
                      ? '準耐力壁等を含む'
                      : '',
                ]
              }),
              { numeric: [2, 3, 4, 6] },
            )}`,
        )
        .join('') +
        note(
          '有効長は開口部を除いた長さが最小長さ以上の区間の合計。倍率は告示1100号別表第1、併用は和（上限 7.0、9cm角たすき掛けを含む場合 5.0）。筋かい軸組は Ho > 3.2m で αh = 3.5Ld/Ho を乗ずる。',
        ),
      true,
    ),
    section(
      '5. 壁量の判定',
      table(
        [
          '階',
          '方向',
          '存在壁量 (cm)',
          '　うち準耐力壁等 (cm)',
          '必要（地震）(cm)',
          '必要（風）(cm)',
          '判定用必要壁量 (cm)',
          '充足率',
          '判定',
        ],
        r.existing.value.rows.map((row) => {
          const x = row.value
          return [
            `${x.storey}階`,
            dirLabel(x.direction as Dir),
            cm(x.existingCm),
            cm(x.countedQuasiCm),
            cm(x.quakeCm),
            cm(x.windCm),
            cm(x.requiredCm),
            pct(x.ratio),
            judge(x.ok),
          ]
        }),
        { numeric: [2, 3, 4, 5, 6, 7] },
      ) +
        `<p>総合判定：${judge(r.existing.value.ok)}</p>` +
        (r.input.quasiWalls
          ? note('準耐力壁等は必要壁量の 1/2 まで算入。超過分は算入していない。')
          : note('準耐力壁等は算入していない（設定で算入可）。')),
    ),
    section(
      '6. 参考：耐震等級（品確法）',
      (() => {
        const g = (
          v as {
            referenceGrades?: {
              grade2: { value: { lw: number[] } }
              grade3: { value: { lw: number[] } }
            }
          }
        ).referenceGrades
        if (!g) return note('参考値なし')
        return (
          table(
            ['階', '基準法 Lw', '等級2（×1.25）Lw', '等級3（×1.5）Lw'],
            r.input.storeys.map((s, i) => [
              `${s.index}階`,
              cm(v.lw[i]),
              cm(g.grade2.value.lw[i]),
              cm(g.grade3.value.lw[i]),
            ]),
            { numeric: [1, 2, 3] },
          ) +
          note(
            '等級2・3 は参考（確認申請の判定には用いない）。多雪区域の積雪は等級の計算にのみ加算。',
          )
        )
      })(),
    ),
  ].join('')
  return page(
    '壁量計算書',
    '建築基準法施行令第46条第4項・告示第1100号（必要壁量・存在壁量・判定）',
    meta,
    body,
  )
}

/** D2 四分割法検討書 */
export function d2QuarterMethod(r: KenchikuResults, meta: DocumentMeta): string {
  const rows = r.quarter.value.rows
  const body = [
    section(
      '1. 側端部分の床面積と存在壁量',
      table(
        [
          '階',
          '方向',
          '側端',
          '範囲 (m)',
          '側端床面積 (㎡)',
          '存在壁量 (cm)',
          '必要壁量 (cm)',
          '充足率',
          '壁率比',
          '判定',
        ],
        rows.flatMap((row) => {
          const q = row.value
          return q.bands.map((b, k) => [
            `${q.storey}階`,
            dirLabel(q.direction),
            k === 0 ? '下側/左側 1/4' : '上側/右側 1/4',
            `${n(b.min)}〜${n(b.max)}`,
            n(b.area),
            cm(b.wallCm),
            cm(q.required[k]),
            pct(q.ratios[k] ?? null),
            k === 0 ? (q.wallRatio === null ? '－' : n(q.wallRatio, 2)) : '',
            k === 0 ? judge(q.ok) : '',
          ])
        }),
        { numeric: [4, 5, 6] },
      ) +
        note(
          '側端部分の必要壁量 = 側端部分の床面積 × Lw（地震）。両側端の充足率がともに 1.0 以上、または壁率比（小/大）が 0.5 以上で適合。偏心率が各階各方向 0.3 以下なら四分割法に代えられる。',
        ) +
        `<p>総合判定：${judge(r.quarter.value.ok)}</p>`,
    ),
    section(
      '2. 側端部分の根拠図',
      r.input.storeys
        .map((s, i) => {
          const segs = r.walls.value.storeys[i]!.value.segments.map((g) => g.value)
          return `<h3>${s.index}階</h3>${planSvg(s, { segments: segs, quarterAxis: 'both', showWallIds: true })}<div class="legend">青＝X方向の耐力壁、緑＝Y方向の耐力壁、点線＝四分割線（X方向の検討は上下の帯、Y方向の検討は左右の帯）</div>`
        })
        .join(''),
      true,
    ),
    section(
      '3. 式と根拠',
      rows
        .map((row) =>
          explainBlock(row.explain, `${row.value.storey}階 ${dirLabel(row.value.direction)}`),
        )
        .join(''),
    ),
  ].join('')
  return page('四分割法検討書', '告示第1100号第4（壁の配置のバランス）', meta, body)
}

/** D3 N値計算書 */
export function d3NValue(r: KenchikuResults, meta: DocumentMeta): string {
  const rows = r.nValues.value.rows
  const byStorey = r.input.storeys.map((s) => rows.filter((row) => row.value.storey === s.index))
  const body = [
    section(
      '1. 柱頭・柱脚の接合部（N値と金物区分）',
      byStorey
        .map((list, i) => {
          const s = r.input.storeys[i]!
          return `<h3>${s.index}階（横架材上端間距離 ${n(list[0]?.value.ho ?? null)} m${(list[0]?.value.ho ?? 0) > 3.2 ? '・3.2m 超のため N値計算法必須' : ''}）</h3>${table(
            [
              '柱',
              '位置 (x, y)',
              '出隅',
              '方向',
              'A1',
              'B1',
              'A2',
              'B2',
              'L',
              'N',
              '金物（記号）',
              '必要耐力 (kN)',
            ],
            list.map((row) => {
              const v = row.value
              const g = v.governing
              return [
                v.column.id.replace(/^.*column:?/, '').replace(/^column_/, '') || v.column.id,
                `(${n(v.column.at[0], 2)}, ${n(v.column.at[1], 2)})`,
                v.corner ? '○' : '－',
                dirLabel(g.direction),
                n(g.a1, 2),
                n(g.b1, 1),
                n(g.a2, 2),
                n(g.b2, 1),
                n(g.l, 1),
                n(g.n, 2),
                `${g.hardware.name}（${g.hardware.symbol}）`,
                g.hardware.requiredKn === null ? '個別計算' : n(g.hardware.requiredKn, 1),
              ]
            }),
            { numeric: [4, 5, 6, 7, 8, 9, 11] },
          )}`
        })
        .join('') +
        note(
          'N = A1×B1 + A2×B2 − L（平屋・最上階は A2×B2 なし）。B1,B2: 出隅 0.8 / その他 0.5。L: 最上階 出隅 0.4 / その他 0.6、2階建ての1階 出隅 1.0 / その他 1.6。A は柱両側の軸組の倍率差（筋かいは補正値を加算）。',
        ),
    ),
    section(
      '2. 柱位置図（金物記号）',
      r.input.storeys
        .map((s, i) => {
          const segs = r.walls.value.storeys[i]!.value.segments.map((g) => g.value)
          const cols = byStorey[i]!.map((row) => ({
            at: row.value.column.at,
            label: row.value.governing.hardware.symbol,
            ok: !row.value.governing.individualCalculation,
          }))
          return `<h3>${s.index}階</h3>${planSvg(s, { segments: segs, columns: cols, showWallIds: true })}`
        })
        .join(''),
      true,
    ),
    section(
      '3. 式と根拠',
      rows
        .slice(0, 40)
        .map((row) => explainBlock(row.explain, `${row.value.storey}階 柱 ${row.value.column.id}`))
        .join('') + (rows.length > 40 ? note(`他 ${rows.length - 40} 本は省略`) : ''),
    ),
  ].join('')
  return page('N値計算書（柱頭・柱脚接合金物）', '平成12年建設省告示第1460号 第2号', meta, body)
}

/** D4 柱の小径計算書 */
export function d4ColumnSize(r: KenchikuResults, meta: DocumentMeta): string {
  const storeys = r.columns.value.storeys
  const body = [
    section(
      '1. 必要小径（算定式・座屈・有効細長比）',
      table(
        [
          '階',
          '横架材間距離 l (mm)',
          '区分',
          '負担荷重 (kN/㎡)',
          'a=√(w·Ae/(Kd/3·Fc)) (mm)',
          '座屈による小径 (mm)',
          '細長比150による小径 (mm)',
          '必要小径 de (mm)',
          'de/l',
        ],
        storeys.flatMap((s) =>
          (['exterior', 'interior'] as const).map((k) => {
            const c = s.value[k]
            const sub = c.explain.substituted
            const w = /w=([0-9.]+)/.exec(sub)?.[1]
            const l = /l=([0-9.]+)/.exec(sub)?.[1]
            return [
              `${s.value.index}階`,
              l ?? '－',
              k === 'exterior' ? '外周柱' : '内部柱',
              w ?? '－',
              n(c.value.a, 2),
              cm(c.value.deBuckling),
              cm(c.value.deSlenderness),
              cm(c.value.de),
              c.value.ratio,
            ]
          }),
        ),
        { numeric: [1, 3, 4, 5, 6, 7] },
      ) +
        note(
          `木材 Fc = ${r.input.timber.fc} N/mm²（${r.input.timber.standard} ${r.input.timber.species} ${r.input.timber.grade}）、柱1本の負担面積 Ae = ${LOADS.columnArea} ㎡、Kd = ${LOADS.kd}。令43条・告示1349号第1（令和7年4月改正）。精緻な検討は樹種・等級と実際の負担面積で行う。`,
        ),
    ),
    section(
      '2. 柱ノードとの比較',
      storeys.some((s) => s.value.columns?.length)
        ? table(
            ['階', '柱', '実寸（短辺 mm）', '外周柱として', '内部柱として', '通し柱'],
            storeys.flatMap((s) =>
              (s.value.columns ?? []).map((c) => [
                `${s.value.index}階`,
                c.id,
                c.actualMm === undefined ? '－' : cm(c.actualMm),
                c.exteriorOk === undefined ? '－' : judge(c.exteriorOk),
                c.interiorOk === undefined ? '－' : judge(c.interiorOk),
                c.through ? '○' : '－',
              ]),
            ),
            { numeric: [2] },
          )
        : note('柱ノードが無いため実寸との比較はありません。平面図に柱を置くと自動で比較します。'),
    ),
    section(
      '3. 隅柱・細長比の注記',
      note(
        '階数2以上の建築物の隅柱又はこれに準ずる柱は通し柱とするか、接合部を通し柱と同等以上に補強する（令43条5項）。有効細長比は150以下（令43条6項）。壁が取り付く方向の小径は検討不要（告示1349号第1ただし書）。',
      ),
    ),
    section(
      '4. 式と根拠',
      storeys.map((s) => explainBlock(s.explain, `${s.value.index}階`)).join(''),
    ),
  ].join('')
  return page('柱の小径計算書', '建築基準法施行令第43条・平成12年建設省告示第1349号', meta, body)
}

/** D5 各階耐力壁配置図 */
export function d5BearingWallPlan(r: KenchikuResults, meta: DocumentMeta): string {
  const body = r.input.storeys
    .map((s, i) => {
      const segs = r.walls.value.storeys[i]!.value.segments.map((g) => g.value)
      const rowsX = r.existing.value.rows.find(
        (row) => row.value.storey === s.index && row.value.direction === 'x',
      )?.value
      const rowsY = r.existing.value.rows.find(
        (row) => row.value.storey === s.index && row.value.direction === 'y',
      )?.value
      return section(
        `${s.index}階 耐力壁配置図`,
        planSvg(s, {
          segments: segs,
          quarterAxis: 'both',
          showWallIds: true,
          width: 640,
          height: 440,
        }) +
          `<div class="legend">青＝X方向の耐力壁区間、緑＝Y方向、灰色点線＝準耐力壁等、白抜き＝開口部、点線＝四分割線</div>` +
          table(
            ['方向', '存在壁量 (cm)', '必要壁量 (cm)', '充足率', '判定'],
            [
              [
                'X方向',
                cm(rowsX?.existingCm),
                cm(rowsX?.requiredCm),
                pct(rowsX?.ratio ?? null),
                rowsX ? judge(rowsX.ok) : '－',
              ],
              [
                'Y方向',
                cm(rowsY?.existingCm),
                cm(rowsY?.requiredCm),
                pct(rowsY?.ratio ?? null),
                rowsY ? judge(rowsY.ok) : '－',
              ],
            ],
            { numeric: [1, 2] },
          ) +
          table(
            ['壁番号', '方向', '仕様', '倍率', '区間長 (m)', '壁量 (cm)'],
            segs.map((g) => [
              g.wallId.replace(/^wall_/, ''),
              dirLabel(g.direction),
              g.spec.kind === 'combined'
                ? (g.spec.components ?? []).map((c) => c.kind).join('+')
                : g.spec.kind,
              n(g.ratio, 2),
              n(g.length),
              cm(g.wallCm),
            ]),
            { numeric: [3, 4, 5] },
          ),
        i > 0,
      )
    })
    .join('')
  return page(
    '各階耐力壁配置図',
    '建築基準法施行規則第1条の3（各階の耐力壁の位置・種類）',
    meta,
    body +
      note(
        esc(
          '壁番号は 3D エディタの壁 ID の末尾。仕様の記号は告示1100号別表第1の区分（例：panel-plywood＝構造用合板、brace-45x90＝4.5×9cm 筋かい）。',
        ),
      ),
  )
}
