import { explained } from '../explain'
import { BEARING_RULES } from '../knowledge/bearing-ratios'
import type { Dir, JpBuildingInput, JpStorey } from '../model'
import { type BearingSegment, bearingWalls } from './bearing-wall'
import { clipBand, EPS, signedArea, validatePolygon } from './polygon'
import { requiredWall } from './required-wall'
import { nonNegative } from './validation'

export function quarterBalance(
  area1: number,
  area2: number,
  wall1: number,
  wall2: number,
  lw: number,
) {
  for (const v of [area1, area2, wall1, wall2, lw]) nonNegative(v, '四分割入力')
  const required = [area1 * lw, area2 * lw] as const
  const ratios = required.map((r, i) => (r === 0 ? null : [wall1, wall2][i]! / r))
  const both = wall1 + EPS >= required[0] && wall2 + EPS >= required[1]
  const max = Math.max(...ratios.map((r) => r ?? 0))
  const wallRatio =
    ratios.includes(null) || max === 0 ? null : Math.min(...(ratios as number[])) / max
  const ok = both || (wallRatio !== null && wallRatio + EPS >= 0.5)
  return explained(
    { required, ratios, wallRatio, ok },
    '必要=側端面積×Lw; 充足率=存在/必要; 両端充足率≥1 または min/max≥0.5',
    `面積=${area1},${area2}; Lw=${lw}; 壁量=${wall1},${wall2}; 必要=${required}; 充足率=${ratios}; 壁率比=${wallRatio}; 適合=${ok}`,
    BEARING_RULES.references,
  )
}

export function quarterStorey(
  storey: JpStorey,
  direction: Dir,
  lw: number,
  segments: BearingSegment[],
) {
  validatePolygon(storey.floorPolygon)
  for (const hole of storey.holes ?? []) validatePolygon(hole)
  const axis = direction === 'x' ? 1 : 0
  const coords = storey.floorPolygon.map((p) => p[axis])
  const min = Math.min(...coords)
  const max = Math.max(...coords)
  const width = (max - min) / 4
  const bands = [
    [min, min + width],
    [max - width, max],
  ].map(([a, b]) => {
    const polygon = clipBand(storey.floorPolygon, axis, a!, b!)
    const holes = (storey.holes ?? []).map((h) => clipBand(h, axis, a!, b!))
    const area = Math.max(
      0,
      Math.abs(signedArea(polygon)) - holes.reduce((sum, h) => sum + Math.abs(signedArea(h)), 0),
    )
    const selected = segments.filter((s) => {
      const middle = (s.start[axis] + s.end[axis]) / 2
      return !s.quasi && s.direction === direction && middle >= a! - EPS && middle <= b! + EPS
    })
    return {
      min: a!,
      max: b!,
      polygon,
      holes,
      area,
      wallCm: selected.reduce((sum, s) => sum + s.wallCm, 0),
      wallIds: selected.map((s) => s.wallId),
    }
  })
  const check = quarterBalance(
    bands[0]!.area,
    bands[1]!.area,
    bands[0]!.wallCm,
    bands[1]!.wallCm,
    lw,
  )
  return explained(
    { storey: storey.index, direction, axis, bands, ...check.value },
    check.explain.formula,
    `直交軸=${axis}; 範囲=${min}〜${max}; 帯幅=${width}; ${check.explain.substituted}`,
    BEARING_RULES.references,
    ['準耐力壁等は必要壁量の1/2以下に制限するため、四分割の存在壁量には算入しない。'],
    [check.explain],
  )
}

export function quarterMethod(input: JpBuildingInput) {
  const walls = bearingWalls(input)
  const quake = requiredWall(input)
  const rows = input.storeys.flatMap((s, i) =>
    (['x', 'y'] as const).map((d) =>
      quarterStorey(
        s,
        d,
        quake.value.lw[i]!,
        walls.value.storeys[i]!.value.segments.map((s) => s.value),
      ),
    ),
  )
  return explained(
    { rows, ok: rows.every((r) => r.value.ok) },
    '各階各方向の直交軸を四等分し両側端帯を検定',
    `適合=${rows.every((r) => r.value.ok)}`,
    BEARING_RULES.references,
    undefined,
    [walls.explain, quake.explain, ...rows.map((r) => r.explain)],
  )
}
