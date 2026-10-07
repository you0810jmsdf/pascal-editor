import type { Reference } from '../explain'
import { CODE_REFERENCES as R } from '../knowledge/code-references'
import type { JpBuildingInput, JpSiteInput, Pt } from '../model'
import { distance } from '../structural/polygon'
import {
  areaOf,
  buildingAreaPolygon,
  buildingHeights,
  edgesOf,
  floorLevels,
  fmt,
  minDistanceToEdge,
  northVector,
  pointOnWall,
  pointToSegment,
  polygonDistance,
  rayToBoundary,
  totalFloorArea,
} from './geometry'
import type { CheckStatus, CodeCheck } from './types'

export const RESIDENTIAL_ZONES = new Set([
  'R1-low',
  'R2-low',
  'R-garden',
  'R1-mid',
  'R2-mid',
  'R1',
  'R2',
  'quasi-R',
])
export const LOW_RISE_ZONES = new Set(['R1-low', 'R2-low', 'R-garden'])
export const MID_RISE_ZONES = new Set(['R1-mid', 'R2-mid'])

type Extra = {
  measured?: string
  limit?: string
  formula?: string
  substituted?: string
  notes?: string[]
}

export function makeCheck(
  id: string,
  title: string,
  status: CheckStatus,
  ref: Reference,
  message: string,
  extra: Extra = {},
): CodeCheck {
  return {
    id,
    title,
    status,
    measured: extra.measured,
    limit: extra.limit,
    message,
    explain: {
      formula: extra.formula ?? title,
      substituted: extra.substituted ?? message,
      references: [ref],
      notes: extra.notes,
    },
  }
}

const needs = (id: string, title: string, ref: Reference, what: string) =>
  makeCheck(id, title, 'input-needed', ref, `${what}を入力すると判定できます`)

/** 真北方向・道路種別に依らず、建物の最高高さ（地盤面から）。1階床高が分かればそれも足す。 */
function topHeight(input: JpBuildingInput) {
  const { top, eave } = buildingHeights(input)
  const lift = input.firstFloorHeight ?? 0
  return { top: top + lift, eave: eave + lift, lift }
}

function roadEdges(site: JpSiteInput) {
  const edges = edgesOf(site.polygon ?? [])
  return (site.roads ?? [])
    .map((road) => ({ road, edge: edges[road.edgeIndex] }))
    .filter(
      (r): r is { road: NonNullable<JpSiteInput['roads']>[number]; edge: [Pt, Pt] } => !!r.edge,
    )
}

export function checkRoad(input: JpBuildingInput): CodeCheck {
  const id = 'site.road'
  const title = '接道義務（幅員4m以上の道路に2m以上）'
  const site = input.site
  if (!site?.polygon) return needs(id, title, R.road, '敷地境界（site.polygon）')
  if (!site.roads?.length)
    return needs(id, title, R.road, '接道する道路（敷地境界の辺番号・幅員・種別）')
  const roads = roadEdges(site)
  if (!roads.length)
    return makeCheck(id, title, 'ng', R.road, '道路の辺番号が敷地境界の辺に対応していません')
  const frontage = roads.reduce((sum, r) => sum + distance(r.edge[0], r.edge[1]), 0)
  const narrow = roads.filter((r) => r.road.width < 4)
  const twoProject = narrow.filter((r) => r.road.type === 'art42-2')
  const measured = `接道長さ ${fmt(frontage)}m・幅員 ${roads.map((r) => fmt(r.road.width, 1)).join('/')}m`
  const limit = '接道 2.0m 以上・幅員 4.0m 以上'
  if (frontage + 1e-9 < 2)
    return makeCheck(id, title, 'ng', R.road, '接道長さが 2m に足りません', { measured, limit })
  if (narrow.length && narrow.length === twoProject.length)
    return makeCheck(
      id,
      title,
      'warn',
      R.road,
      '2項道路に接しています。道路中心線から 2m 後退した線を道路境界とみなす必要があります（後退部分は敷地面積に算入不可）',
      { measured, limit },
    )
  if (narrow.length)
    return makeCheck(
      id,
      title,
      'ng',
      R.road,
      '幅員 4m 未満の「その他」の道に接しているため、法42条の道路に該当するか確認が必要です',
      { measured, limit },
    )
  return makeCheck(id, title, 'ok', R.road, '接道義務を満たします', { measured, limit })
}

export function checkKenpei(input: JpBuildingInput): CodeCheck {
  const id = 'site.kenpei'
  const title = '建蔽率'
  const site = input.site
  if (!site?.polygon) return needs(id, title, R.kenpei, '敷地境界（site.polygon）')
  if (site.kenpeiPct === undefined) return needs(id, title, R.kenpei, '指定建蔽率（kenpeiPct）')
  const siteArea = areaOf(site.polygon)
  const { area } = buildingAreaPolygon(input)
  const ratio = (area / siteArea) * 100
  const bonus = site.cornerLotBonus ? 10 : 0
  const limit = site.kenpeiPct + bonus
  const notes = [
    '建築面積は各階の壁芯床面積ポリゴンのうち最大のもので近似（1m を超える軒の出・バルコニーは未考慮）。',
    '防火地域内の耐火建築物等の +10% 緩和は未考慮。',
  ]
  return makeCheck(
    id,
    title,
    ratio <= limit + 1e-9 ? 'ok' : 'ng',
    R.kenpei,
    ratio <= limit + 1e-9 ? '指定建蔽率以内です' : '指定建蔽率を超えています',
    {
      measured: `建築面積 ${fmt(area)}㎡ ÷ 敷地面積 ${fmt(siteArea)}㎡ = ${fmt(ratio, 1)}%`,
      limit: `${limit}%${bonus ? '（角地緩和 +10 を含む）' : ''}`,
      formula: '建蔽率 = 建築面積 / 敷地面積 ≦ 指定建蔽率（＋角地 10%）',
      notes,
    },
  )
}

export function checkYoseki(input: JpBuildingInput): CodeCheck {
  const id = 'site.yoseki'
  const title = '容積率'
  const site = input.site
  if (!site?.polygon) return needs(id, title, R.yoseki, '敷地境界（site.polygon）')
  if (site.yosekiPct === undefined) return needs(id, title, R.yoseki, '指定容積率（yosekiPct）')
  const siteArea = areaOf(site.polygon)
  const total = totalFloorArea(input)
  const ratio = (total / siteArea) * 100
  const roads = roadEdges(site)
  const residential = site.zoning ? RESIDENTIAL_ZONES.has(site.zoning) : true
  const factor = residential ? 0.4 : 0.6
  const roadLimit = roads.length
    ? Math.max(...roads.map((r) => r.road.width)) * factor * 100
    : undefined
  const limit = Math.min(site.yosekiPct, roadLimit ?? Number.POSITIVE_INFINITY)
  const notes = ['延べ面積は各階の壁芯床面積の合計（地階・車庫・小屋裏収納の不算入は未考慮）。']
  if (!site.zoning) notes.push('用途地域が未入力のため前面道路幅員の係数は住居系の 4/10 で計算。')
  const within = ratio <= limit + 1e-9
  const status: CheckStatus = !within ? 'ng' : roadLimit === undefined ? 'warn' : 'ok'
  return makeCheck(
    id,
    title,
    status,
    R.yoseki,
    !within
      ? '容積率の限度を超えています'
      : roadLimit === undefined
        ? '指定容積率以内ですが、前面道路幅員による制限（幅員×4/10 または 6/10）が未確認です'
        : '容積率の限度以内です',
    {
      measured: `延べ面積 ${fmt(total)}㎡ ÷ 敷地面積 ${fmt(siteArea)}㎡ = ${fmt(ratio, 1)}%`,
      limit: `${fmt(limit, 0)}%（指定 ${site.yosekiPct}%${roadLimit !== undefined ? `・道路幅員 ${fmt(roadLimit, 0)}%` : ''}）`,
      formula:
        '容積率 = 延べ面積 / 敷地面積 ≦ min(指定容積率, 前面道路幅員 × 4/10[住居系] or 6/10)',
      notes,
    },
  )
}

export function checkAbsoluteHeight(input: JpBuildingInput): CodeCheck {
  const id = 'site.height'
  const title = '絶対高さ制限（低層住居専用地域等）'
  const site = input.site
  const { top, lift } = topHeight(input)
  const measured = `最高高さ ${fmt(top)}m${lift ? '' : '（1階床高は未加算）'}`
  if (site?.absoluteHeightLimit !== undefined) {
    const ok = top <= site.absoluteHeightLimit + 1e-9
    return makeCheck(
      id,
      title,
      ok ? 'ok' : 'ng',
      R.absoluteHeight,
      ok ? '高さの限度以内です' : '高さの限度を超えています',
      {
        measured,
        limit: `${site.absoluteHeightLimit}m`,
      },
    )
  }
  if (site?.zoning && LOW_RISE_ZONES.has(site.zoning))
    return needs(
      id,
      title,
      R.absoluteHeight,
      '高さの限度（都市計画で定める 10m または 12m・absoluteHeightLimit）',
    )
  if (!site?.zoning) return needs(id, title, R.absoluteHeight, '用途地域（zoning）')
  return makeCheck(
    id,
    title,
    'n/a',
    R.absoluteHeight,
    'この用途地域に絶対高さ制限はありません（高度地区は別途）',
    { measured },
  )
}

export function checkWallSetback(input: JpBuildingInput): CodeCheck {
  const id = 'site.setback'
  const title = '外壁の後退距離'
  const site = input.site
  if (!site?.polygon) return needs(id, title, R.wallSetback, '敷地境界（site.polygon）')
  if (site.wallSetback === undefined) {
    if (site.zoning && LOW_RISE_ZONES.has(site.zoning))
      return needs(id, title, R.wallSetback, '外壁後退の指定（1.0m / 1.5m、指定が無ければ 0）')
    return makeCheck(id, title, 'n/a', R.wallSetback, '外壁後退の指定がない用途地域です')
  }
  if (site.wallSetback <= 0) return makeCheck(id, title, 'n/a', R.wallSetback, '外壁後退の指定なし')
  const { polygon } = buildingAreaPolygon(input)
  const d = polygonDistance(polygon, site.polygon)
  const ok = d + 1e-9 >= site.wallSetback
  return makeCheck(
    id,
    title,
    ok ? 'ok' : 'ng',
    R.wallSetback,
    ok ? '後退距離を満たします' : '外壁が後退距離より境界に近づいています',
    {
      measured: `境界までの最短距離 ${fmt(d)}m（壁芯基準）`,
      limit: `${site.wallSetback}m`,
      notes: [
        '壁芯で測っているため、外壁面ではさらに壁厚の半分だけ近くなる。物置等の緩和（法54条2項）は未考慮。',
      ],
    },
  )
}

function applicableDistance(residential: boolean, yoseki: number | undefined): number {
  const y = yoseki ?? 200
  if (residential) return y <= 200 ? 20 : y <= 300 ? 25 : y <= 400 ? 30 : 35
  return y <= 400 ? 20 : y <= 600 ? 25 : y <= 800 ? 30 : 35
}

export function checkRoadSlope(input: JpBuildingInput): CodeCheck {
  const id = 'site.roadSlope'
  const title = '道路斜線制限'
  const site = input.site
  if (!site?.polygon) return needs(id, title, R.roadSlope, '敷地境界（site.polygon）')
  const roads = roadEdges(site)
  if (!roads.length) return needs(id, title, R.roadSlope, '前面道路（roads）')
  const residential = site.zoning ? RESIDENTIAL_ZONES.has(site.zoning) : true
  const factor = residential ? 1.25 : 1.5
  const reach = applicableDistance(residential, site.yosekiPct)
  const { polygon } = buildingAreaPolygon(input)
  const { top } = topHeight(input)
  let worst: { margin: number; where: Pt; limit: number; road: number } | null = null
  roads.forEach(({ road, edge }, index) => {
    const setback = minDistanceToEdge(polygon, edge)
    for (const p of polygon) {
      const toEdge = pointToSegment(p, edge[0], edge[1])
      if (toEdge > reach) continue // 適用距離を超える部分には及ばない
      const l = toEdge + road.width + setback // 後退緩和：反対側の境界線を後退距離だけ外側へ
      const limit = factor * l
      const margin = limit - top
      if (!worst || margin < worst.margin) worst = { margin, where: p, limit, road: index }
    }
  })
  if (!worst)
    return makeCheck(id, title, 'n/a', R.roadSlope, '建物が道路斜線の適用距離の外にあります')
  const w = worst as { margin: number; where: Pt; limit: number; road: number }
  const ok = w.margin >= -1e-9
  return makeCheck(
    id,
    title,
    ok ? 'ok' : 'ng',
    R.roadSlope,
    ok ? '道路斜線以内です' : '道路斜線を超える部分があります（天空率による検証で代替可）',
    {
      measured: `最も厳しい点 (${fmt(w.where[0], 1)}, ${fmt(w.where[1], 1)}) の高さ ${fmt(top)}m`,
      limit: `${factor}×L = ${fmt(w.limit)}m（道路 ${w.road + 1}）`,
      formula:
        '高さ ≦ 係数(住居系1.25/その他1.5) × (道路反対側境界までの水平距離 + 後退距離)。適用距離は容積率で 20〜35m',
      notes: [
        '建物の高さは全頂点で最高高さを用いる安全側の近似（屋根勾配による低い部分は未考慮）。',
        '1.25 の緩和（前面道路幅員 12m 以上）・2 以上の前面道路の緩和は未考慮。',
      ],
    },
  )
}

export function checkNorthSlope(input: JpBuildingInput): CodeCheck {
  const id = 'site.northSlope'
  const title = '北側斜線制限'
  const site = input.site
  if (!site?.polygon) return needs(id, title, R.northSlope, '敷地境界（site.polygon）')
  if (!site.zoning) return needs(id, title, R.northSlope, '用途地域（zoning）')
  const base = LOW_RISE_ZONES.has(site.zoning) ? 5 : MID_RISE_ZONES.has(site.zoning) ? 10 : null
  if (base === null)
    return makeCheck(id, title, 'n/a', R.northSlope, 'この用途地域に北側斜線はありません')
  const north = northVector(site.northRotation)
  const roads = roadEdges(site)
  const { polygon } = buildingAreaPolygon(input)
  const { top } = topHeight(input)
  let worst: { margin: number; where: Pt; limit: number; d: number } | null = null
  for (const p of polygon) {
    const hit = rayToBoundary(p, north, site.polygon)
    if (!hit) continue
    const road = roads.find((r) => site.polygon && edgesOf(site.polygon)[hit.edgeIndex] === r.edge)
    const d = hit.distance + (road ? road.road.width : 0) // 北側が道路なら反対側境界まで
    const limit = base + 1.25 * d
    const margin = limit - top
    if (!worst || margin < worst.margin) worst = { margin, where: p, limit, d }
  }
  if (!worst)
    return makeCheck(
      id,
      title,
      'warn',
      R.northSlope,
      '建物頂点から真北方向に敷地境界が見つからず判定できません（建物が敷地外にある可能性）',
    )
  const w = worst as { margin: number; where: Pt; limit: number; d: number }
  const ok = w.margin >= -1e-9
  return makeCheck(
    id,
    title,
    ok ? 'ok' : 'ng',
    R.northSlope,
    ok ? '北側斜線以内です' : '北側斜線を超える部分があります',
    {
      measured: `最も厳しい点 (${fmt(w.where[0], 1)}, ${fmt(w.where[1], 1)})：真北方向の境界まで ${fmt(w.d)}m、高さ ${fmt(top)}m`,
      limit: `${base}m + 1.25×${fmt(w.d)} = ${fmt(w.limit)}m`,
      formula:
        '高さ ≦ 5m（低層）/10m（中高層）+ 1.25 × 真北方向の隣地境界線（道路なら反対側）までの水平距離',
      notes: [
        '最高高さを全頂点に用いる安全側の近似。中高層住居専用地域で日影規制の対象区域なら北側斜線は適用されない（未考慮）。',
      ],
    },
  )
}

export function checkNeighborSlope(input: JpBuildingInput): CodeCheck {
  const id = 'site.neighborSlope'
  const title = '隣地斜線制限'
  const { top } = topHeight(input)
  const residential = input.site?.zoning ? RESIDENTIAL_ZONES.has(input.site.zoning) : true
  const threshold = residential ? 20 : 31
  if (top <= threshold)
    return makeCheck(
      id,
      title,
      'n/a',
      R.neighborSlope,
      `高さ ${fmt(top)}m は立ち上がり ${threshold}m 以下のため適用されません`,
    )
  return makeCheck(
    id,
    title,
    'warn',
    R.neighborSlope,
    `高さ ${fmt(top)}m は立ち上がり ${threshold}m を超えるため隣地斜線の検討が必要です（フェーズAの対象外）`,
  )
}

export function checkShadow(input: JpBuildingInput): CodeCheck {
  const id = 'site.shadow'
  const title = '日影規制（対象判定）'
  const site = input.site
  const { top, eave } = topHeight(input)
  if (!site?.zoning) return needs(id, title, R.shadow, '用途地域（zoning）')
  const lowRise = LOW_RISE_ZONES.has(site.zoning)
  const subject = lowRise ? eave > 7 + 1e-9 || input.storeys.length >= 3 : top > 10 + 1e-9
  const measured = lowRise
    ? `軒高 ${fmt(eave)}m・階数 ${input.storeys.length}`
    : `最高高さ ${fmt(top)}m`
  const limit = lowRise ? '軒高 7m 超または地上3階以上で対象' : '高さ 10m 超で対象'
  if (!subject)
    return makeCheck(id, title, 'n/a', R.shadow, '日影規制の対象建築物ではありません', {
      measured,
      limit,
    })
  const reg = site.shadowRegulation
  return makeCheck(
    id,
    title,
    'warn',
    R.shadow,
    `日影規制の対象です。日影図（冬至日 8〜16時）による検討が必要${reg ? `（測定面 ${reg.measureHeight}m・5〜10m帯 ${reg.hours5to10}h・10m超 ${reg.hoursOver10}h）` : '（規制値は特定行政庁の指定を入力）'}`,
    { measured, limit },
  )
}

export function checkFireSpread(input: JpBuildingInput): CodeCheck {
  const id = 'site.fire'
  const title = '延焼のおそれのある部分の開口部'
  const site = input.site
  if (!site?.polygon) return needs(id, title, R.fireSpread, '敷地境界（site.polygon）')
  const roads = roadEdges(site)
  const edges = edgesOf(site.polygon)
  const floors = floorLevels(input.storeys)
  const hits: string[] = []
  input.storeys.forEach((storey, i) => {
    const threshold = i === 0 ? 3 : 5
    for (const wall of storey.walls) {
      if (!wall.exterior) continue
      for (const opening of wall.openings) {
        const p = pointOnWall(wall.start, wall.end, opening.u)
        let nearest = Number.POSITIVE_INFINITY
        edges.forEach((edge, j) => {
          const road = roads.find((r) => r.edge === edge)
          const d = pointToSegment(p, edge[0], edge[1]) + (road ? road.road.width / 2 : 0) // 道路は中心線から
          if (d < nearest) nearest = d
        })
        if (nearest < threshold - 1e-9)
          hits.push(`${storey.index}階 ${wall.id} u=${fmt(opening.u, 2)}（${fmt(nearest)}m）`)
      }
    }
  })
  void floors
  const measured = `該当する開口部 ${hits.length} 箇所${hits.length ? `：${hits.slice(0, 8).join('、')}${hits.length > 8 ? ' …' : ''}` : ''}`
  const limit = '隣地境界線・道路中心線から 1階 3m・2階以上 5m 以内'
  const notes = [
    '開口の位置は壁芯線上の中心点で評価。対面する建築物との延焼緩和（令和2年改正）は未考慮。',
  ]
  if (site.fireZone === undefined)
    return makeCheck(
      id,
      title,
      'input-needed',
      R.fireSpread,
      `防火地域の指定（fireZone）を入力すると判定できます。${measured}`,
      { measured, limit, notes },
    )
  if (site.fireZone === 'none')
    return makeCheck(
      id,
      title,
      'n/a',
      R.fireSpread,
      `防火・準防火地域外のため開口部の防火設備は不要です（${measured}）`,
      { measured, limit, notes },
    )
  if (site.fireZone === 'art22')
    return makeCheck(
      id,
      title,
      hits.length ? 'warn' : 'ok',
      R.fireSpread,
      hits.length
        ? '法22条区域：延焼のおそれのある外壁は準防火性能（法23条）が必要。開口部の防火設備は不要'
        : '該当する開口部はありません',
      { measured, limit, notes },
    )
  return makeCheck(
    id,
    title,
    hits.length ? 'warn' : 'ok',
    R.fireSpread,
    hits.length
      ? '該当する開口部に防火設備（防火戸・網入りガラス等）が必要です'
      : '延焼のおそれのある部分に開口部はありません',
    { measured, limit, notes },
  )
}

export function checkHeightDistrict(input: JpBuildingInput): CodeCheck {
  const id = 'site.heightDistrict'
  const title = '高度地区'
  const district = input.site?.heightDistrict
  if (!district)
    return makeCheck(
      id,
      title,
      'n/a',
      R.heightDistrict,
      '高度地区の指定なし（未入力なら敷地情報で指定）',
    )
  return makeCheck(
    id,
    title,
    'warn',
    R.heightDistrict,
    `高度地区「${district}」の斜線・高さは都市計画の規定値で別途確認が必要です`,
  )
}

export function siteChecks(input: JpBuildingInput): CodeCheck[] {
  return [
    checkRoad(input),
    checkKenpei(input),
    checkYoseki(input),
    checkAbsoluteHeight(input),
    checkWallSetback(input),
    checkRoadSlope(input),
    checkNorthSlope(input),
    checkNeighborSlope(input),
    checkShadow(input),
    checkFireSpread(input),
    checkHeightDistrict(input),
  ]
}
