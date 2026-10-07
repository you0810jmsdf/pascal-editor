import { type Explained, explained } from '../explain'
import { CODE_REFERENCES } from '../knowledge/code-references'
import { REFERENCES } from '../knowledge/references'
import type { JpBuildingInput, JpStorey, Pt } from '../model'
import { type BearingSegment, bearingWalls } from './bearing-wall'
import { EPS } from './polygon'

/**
 * 参考機能（仕様書 §6.9）。法規の判定には使わない略算で、図書では「参考」章に隔離する。
 * - 偏心率: 耐力壁の壁量を剛性とみなした剛心と、床面積ポリゴンの図心による Re（≦0.3 なら四分割法に代えられる）
 * - 横架材: 部屋の短辺スパンから梁せいの目安を表引き（梁間隔 910mm・無等級材・住宅荷重の一般的な目安）
 * - 基礎: 概算建物重量を布基礎・べた基礎の底面積で割った接地圧と地耐力の比較（告示1347号の区分）
 */

export const ECCENTRICITY_LIMIT = 0.3

/** 多角形の図心（面積重み）。 */
export function centroid(polygon: Pt[]): Pt {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!
    const q = polygon[(i + 1) % polygon.length]!
    const cross = p[0] * q[1] - q[0] * p[1]
    a += cross
    cx += (p[0] + q[0]) * cross
    cy += (p[1] + q[1]) * cross
  }
  if (Math.abs(a) <= EPS) {
    const n = polygon.length || 1
    return [polygon.reduce((s, p) => s + p[0], 0) / n, polygon.reduce((s, p) => s + p[1], 0) / n]
  }
  return [cx / (3 * a), cy / (3 * a)]
}

export function eccentricityStorey(storey: JpStorey, segments: readonly BearingSegment[]) {
  const [xg, yg] = centroid(storey.floorPolygon)
  const x = segments.filter((s) => s.direction === 'x' && !s.quasi && s.wallCm > 0)
  const y = segments.filter((s) => s.direction === 'y' && !s.quasi && s.wallCm > 0)
  const kx = x.reduce((s, g) => s + g.wallCm, 0)
  const ky = y.reduce((s, g) => s + g.wallCm, 0)
  if (kx <= EPS || ky <= EPS)
    return explained(
      { storey: storey.index, computable: false as const, xg, yg },
      '偏心率 Re = 偏心距離 e / 弾力半径 re',
      `階=${storey.index}; X方向またはY方向の耐力壁が無いため算定不可`,
      [REFERENCES.wall],
      ['片方向の耐力壁が無い階は偏心率を求められない。'],
    )
  const yr = x.reduce((s, g) => s + (g.wallCm * (g.start[1] + g.end[1])) / 2, 0) / kx
  const xr = y.reduce((s, g) => s + (g.wallCm * (g.start[0] + g.end[0])) / 2, 0) / ky
  const ey = Math.abs(yg - yr)
  const ex = Math.abs(xg - xr)
  const kr =
    x.reduce((s, g) => s + g.wallCm * ((g.start[1] + g.end[1]) / 2 - yr) ** 2, 0) +
    y.reduce((s, g) => s + g.wallCm * ((g.start[0] + g.end[0]) / 2 - xr) ** 2, 0)
  const rex = Math.sqrt(kr / kx)
  const rey = Math.sqrt(kr / ky)
  const Rex = rex > EPS ? ey / rex : Number.POSITIVE_INFINITY
  const Rey = rey > EPS ? ex / rey : Number.POSITIVE_INFINITY
  return explained(
    {
      storey: storey.index,
      computable: true as const,
      xg,
      yg,
      xr,
      yr,
      ex,
      ey,
      rex,
      rey,
      Rex,
      Rey,
      ok: Rex <= ECCENTRICITY_LIMIT + EPS && Rey <= ECCENTRICITY_LIMIT + EPS,
    },
    '剛心=Σ(壁量×位置)/Σ壁量; 重心=床面積ポリゴンの図心; KR=Σ壁量×(位置−剛心)²; re=√(KR/Σ壁量); Re=e/re ≦ 0.3',
    `階=${storey.index}; 重心=(${xg.toFixed(2)},${yg.toFixed(2)}); 剛心 X壁 y=${yr.toFixed(2)} / Y壁 x=${xr.toFixed(2)}; ey=${ey.toFixed(3)}; ex=${ex.toFixed(3)}; rex=${rex.toFixed(3)}; rey=${rey.toFixed(3)}; Rex=${Rex.toFixed(3)}; Rey=${Rey.toFixed(3)}`,
    [REFERENCES.wall],
    [
      '略算：剛性を壁量（長さ×倍率）に比例とみなし、重心を床面積ポリゴンの図心で代用。令82条の6第2号ロの偏心率は剛性・重量の分布から求めるのが正。',
    ],
  )
}

export function eccentricity(input: JpBuildingInput, walls = bearingWalls(input)) {
  const rows = input.storeys.map((s, i) =>
    eccentricityStorey(
      s,
      walls.value.storeys[i]!.value.segments.map((g) => g.value),
    ),
  )
  const ok = rows.every((r) => r.value.computable && r.value.ok)
  return explained(
    { rows, ok },
    '各階の偏心率 Re が 0.3 以下なら四分割法に代えて壁配置のバランスを満たす（参考）',
    rows
      .map(
        (r) =>
          `${r.value.storey}階: ${r.value.computable ? `Rex=${r.value.Rex.toFixed(3)} Rey=${r.value.Rey.toFixed(3)}` : '算定不可'}`,
      )
      .join('; '),
    [REFERENCES.wall],
    undefined,
    rows.map((r) => r.explain),
  )
}

/** 梁せいの目安（スパン上限 m → 梁せい mm）。梁幅105・梁間隔910・無等級材・住宅の床/屋根荷重相当。 */
export const FLOOR_BEAM_TABLE: readonly (readonly [number, number])[] = [
  [1.82, 105],
  [2.73, 180],
  [3.64, 240],
  [4.55, 300],
  [5.46, 330],
]
export const ROOF_BEAM_TABLE: readonly (readonly [number, number])[] = [
  [1.82, 105],
  [2.73, 150],
  [3.64, 210],
  [4.55, 270],
  [5.46, 300],
]

export function beamGuide(input: JpBuildingInput) {
  const rows = input.storeys.flatMap((s, i) => {
    const top = i === input.storeys.length - 1
    const table = top ? ROOF_BEAM_TABLE : FLOOR_BEAM_TABLE
    return (s.rooms ?? []).map((room) => {
      const xs = room.polygon.map((p) => p[0])
      const ys = room.polygon.map((p) => p[1])
      const w = Math.max(...xs) - Math.min(...xs)
      const d = Math.max(...ys) - Math.min(...ys)
      const span = Math.min(w, d) + 0.12 // 内法に壁厚ぶんを足して芯々に近づける
      const hit = table.find((t) => span <= t[0] + EPS)
      return {
        storey: s.index,
        roomId: room.id,
        roomName: room.name,
        width: w,
        depth: d,
        span,
        member: top ? '小屋梁' : '床梁（上階床）',
        depthMm: hit ? hit[1] : null,
        ok: !!hit,
      }
    })
  })
  return explained(
    { rows },
    '部屋の短辺方向に梁を架けると仮定し、スパン（短辺＋壁厚）をスパン表で引く',
    rows
      .map(
        (r) =>
          `${r.storey}階 ${r.roomName}: span=${r.span.toFixed(2)}m → ${r.depthMm ?? '要個別検討'}`,
      )
      .join('; '),
    [REFERENCES.wall],
    [
      '参考値。実際の梁せいは梁間隔・荷重条件・樹種等級により異なり、プレカット業者または構造設計者の検定が必要。',
    ],
  )
}

export const FOUNDATION_UNIT_LOAD = { heavy: 5.5, light: 5.0 } as const // kN/㎡（固定＋積載＋基礎自重の概算）
export const STRIP_FOOTING_WIDTH = 0.45 // m

export function foundationGuide(input: JpBuildingInput) {
  const soil = input.foundation?.soilBearingKnM2
  const soilUsed = soil ?? 30
  const unit = input.roof.kind === 'tile' ? FOUNDATION_UNIT_LOAD.heavy : FOUNDATION_UNIT_LOAD.light
  const totalFloor = input.storeys.reduce((s, st) => s + st.floorArea, 0)
  const weight = totalFloor * unit
  const ground = input.storeys[0]!
  const exteriorLength = ground.walls
    .filter((w) => w.exterior)
    .reduce((s, w) => s + Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]), 0)
  const wallLength =
    exteriorLength > EPS
      ? exteriorLength
      : ground.walls.reduce(
          (s, w) => s + Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]),
          0,
        )
  const qStrip =
    wallLength > EPS ? weight / (wallLength * STRIP_FOOTING_WIDTH) : Number.POSITIVE_INFINITY
  const qMat = ground.floorArea > EPS ? weight / ground.floorArea : Number.POSITIVE_INFINITY
  const okStrip = qStrip <= soilUsed + EPS
  const okMat = qMat <= soilUsed + EPS
  let recommendation: string
  if (soilUsed < 20)
    recommendation = '地耐力 20kN/㎡ 未満：杭基礎または地盤改良の検討が必要（告示1347号）'
  else if (soilUsed < 30)
    recommendation = okMat
      ? '地耐力 20〜30kN/㎡：べた基礎または杭基礎（布基礎は不可）'
      : 'べた基礎でも接地圧が地耐力を超える。地盤改良等の検討が必要'
  else if (okStrip)
    recommendation = `布基礎（底盤幅 ${STRIP_FOOTING_WIDTH * 1000}mm）で接地圧は地耐力以内`
  else if (okMat) recommendation = 'べた基礎を推奨（布基礎では接地圧超過）'
  else recommendation = 'べた基礎でも接地圧超過。地盤改良等の検討が必要'
  return explained(
    {
      soilKnM2: soilUsed,
      soilAssumed: soil === undefined,
      unitKnM2: unit,
      totalFloorArea: totalFloor,
      weightKn: weight,
      wallLength,
      stripWidth: STRIP_FOOTING_WIDTH,
      qStrip,
      qMat,
      okStrip,
      okMat,
      recommendation,
    },
    'W=延べ面積×単位重量; 布基礎 q=W/(外周壁長×底盤幅); べた基礎 q=W/1階床面積; q≦地耐力',
    `W=${totalFloor.toFixed(2)}×${unit}=${weight.toFixed(1)}kN; 外周壁長=${wallLength.toFixed(2)}m; q布=${qStrip.toFixed(1)}; qべた=${qMat.toFixed(1)}; 地耐力=${soilUsed}${soil === undefined ? '（仮定）' : ''}`,
    [CODE_REFERENCES.foundation],
    [
      '概算重量による接地圧の略算。実際の基礎設計は地盤調査（SWS試験等）の結果に基づき、形式・配筋・底盤幅を決める。',
      ...(soil === undefined
        ? [
            '地耐力が未入力のため 30kN/㎡ を仮定。建物の仕様（foundation.soilBearingKnM2）で入力できる。',
          ]
        : []),
    ],
  )
}

export function referenceChecks(input: JpBuildingInput) {
  const walls = bearingWalls(input)
  const ecc = eccentricity(input, walls)
  const beams = beamGuide(input)
  const foundation = foundationGuide(input)
  return explained(
    { eccentricity: ecc, beams, foundation },
    '参考（法規の判定には用いない略算）: 偏心率・横架材の目安・基礎の接地圧',
    `偏心率 ${ecc.value.ok ? '0.3以下' : '0.3超または算定不可'}; 梁 ${beams.value.rows.length} 室; 基礎 ${foundation.value.recommendation}`,
    [REFERENCES.wall, CODE_REFERENCES.foundation],
    undefined,
    [ecc.explain, beams.explain, foundation.explain],
  )
}

export type ReferenceResults = Explained<ReturnType<typeof referenceChecks>['value']>
