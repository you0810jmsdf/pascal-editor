import { explained } from '../explain'
import {
  N_VALUE_COEFFICIENTS as COEF,
  N_VALUE_REFERENCES,
  N_VALUE_TABLES,
} from '../knowledge/n-value'
import type { Dir, JpBuildingInput, JpColumn, JpStorey, Pt } from '../model'
import { type BearingSegment, bearingComponents, bearingWalls } from './bearing-wall'
import { distance, EPS, isCorner, validatePolygon } from './polygon'
import { nonNegative } from './validation'

export function nValue(
  a1: number,
  a2: number,
  corner: boolean,
  firstOfTwo: boolean,
  upperCorner = false,
) {
  nonNegative(a1, 'A1')
  nonNegative(a2, 'A2')
  const b1 = corner ? COEF.b.corner : COEF.b.other
  const b2 = upperCorner ? COEF.b.corner : COEF.b.other
  const l = (firstOfTwo ? COEF.firstL : COEF.topL)[corner ? 'corner' : 'other']
  const n = a1 * b1 + (firstOfTwo ? a2 * b2 : 0) - l
  const entry = N_VALUE_TABLES.hardware.find((h) => h.maxN === null || n <= h.maxN + EPS)!
  // TODO(spec §4.3): 「ぬ」は仕様書の25kN×2を表示し、JSONの必要耐力30kNとの相違は原典照合まで未確定とする。
  const hardware =
    entry.symbol === 'ぬ' ? { ...entry, name: '引き寄せ金物 25kN×2', requiredKn: null } : entry
  return explained(
    {
      a1,
      a2: firstOfTwo ? a2 : 0,
      b1,
      b2: firstOfTwo ? b2 : 0,
      l,
      n,
      hardware,
      individualCalculation: entry.symbol === '超過',
    },
    'N=A1×B1+(2階建て1階のみA2×B2)−L',
    `${a1}×${b1}+${firstOfTwo ? a2 : 0}×${firstOfTwo ? b2 : 0}−${l}=${n}; 金物=${hardware.symbol}`,
    N_VALUE_REFERENCES,
    entry.symbol === 'ぬ'
      ? ['ぬの名称は仕様書の25kN×2を採用。JSONの必要耐力30kNとの相違は要照合。']
      : [],
  )
}

function columnsFor(storey: JpStorey, segments: BearingSegment[]): JpColumn[] {
  if (storey.columns?.length) return storey.columns.map((c) => ({ ...c, at: [...c.at] }))
  const columns: JpColumn[] = []
  for (const s of segments)
    for (const at of [s.start, s.end]) {
      if (!columns.some((c) => distance(c.at, at) <= 0.15 + EPS))
        columns.push({ id: `${storey.index}:column:${columns.length + 1}`, at: [...at] })
    }
  return columns
}

function imbalance(at: Pt, direction: Dir, segments: BearingSegment[]) {
  const axis = direction === 'x' ? 0 : 1
  const sides = [0, 0]
  const notes = new Set<string>()
  const contributions: { wallId: string; side: number; ratio: number; correction: number }[] = []
  for (const s of segments) {
    if (s.direction !== direction) continue
    const start = distance(s.start, at) <= 0.15 + EPS
    const end = distance(s.end, at) <= 0.15 + EPS
    if (!start && !end) continue
    const other = start ? s.end : s.start
    const side = other[axis] >= at[axis] ? 1 : 0
    let correction = 0
    for (const part of bearingComponents(s.spec)) {
      const row = N_VALUE_TABLES.braceCorrection.values.find((r) => r.kind === part.kind)
      if (!row) continue
      correction +=
        part.braceTop === undefined || part.braceTop === (start ? 'start' : 'end')
          ? row.topColumn
          : row.bottomColumn
      if (row.topColumn !== 0) {
        notes.add('筋かい補正値は提供JSON（確信度medium）。公開前に告示本文で要照合。')
        if (part.braceTop === undefined)
          notes.add('筋かいの向き未設定（提供表に従い両端に正の補正）')
      }
    }
    sides[side]! += s.ratio + correction
    contributions.push({ wallId: s.wallId, side, ratio: s.ratio, correction })
  }
  return explained(
    { a: Math.abs(sides[1]! - sides[0]!), sides, contributions },
    'A=|Σ右側(倍率+筋かい補正)−Σ左側(倍率+筋かい補正)|',
    `方向=${direction}; |${sides[1]}−${sides[0]}|=${Math.abs(sides[1]! - sides[0]!)}; 内訳=${JSON.stringify(contributions)}`,
    N_VALUE_REFERENCES,
    [...notes],
  )
}

export function nValues(input: JpBuildingInput) {
  const walls = bearingWalls(input)
  const floors = input.storeys.map((s, i) => {
    validatePolygon(s.floorPolygon)
    const segments = walls.value.storeys[i]!.value.segments.map((s) => s.value).filter(
      (s) => !s.quasi && s.ratio > 0,
    )
    const columns = columnsFor(s, segments)
    if (columns.some((c) => c.at.some((v) => !Number.isFinite(v))))
      throw new RangeError('柱座標は有限値が必要です')
    return { storey: s, segments, columns }
  })
  const rows = floors.flatMap((floor, i) =>
    floor.columns.map((column) => {
      const corner = isCorner(column.at, floor.storey.floorPolygon)
      const upper = floors[i + 1]
      const upperColumn = upper?.columns
        .filter((c) => distance(c.at, column.at) <= 0.3 + EPS)
        .sort(
          (a, b) =>
            distance(a.at, column.at) - distance(b.at, column.at) || a.id.localeCompare(b.id),
        )[0]
      const upperCorner =
        !!upperColumn && !!upper && isCorner(upperColumn.at, upper.storey.floorPolygon)
      const directions = (['x', 'y'] as const).map((direction) => {
        const lowerA = imbalance(column.at, direction, floor.segments)
        const upperA = imbalance(
          upperColumn?.at ?? column.at,
          direction,
          upperColumn && upper ? upper.segments : [],
        )
        const result = nValue(lowerA.value.a, upperA.value.a, corner, !!upper, upperCorner)
        return explained(
          { direction, ...result.value },
          result.explain.formula,
          result.explain.substituted,
          N_VALUE_REFERENCES,
          [
            ...(result.explain.notes ?? []),
            ...(lowerA.explain.notes ?? []),
            ...(upperA.explain.notes ?? []),
          ],
          [lowerA.explain, upperA.explain],
        )
      })
      const governing =
        directions[0]!.value.n >= directions[1]!.value.n ? directions[0]! : directions[1]!
      const ho = walls.value.storeys[i]!.value.ho
      return explained(
        {
          storey: floor.storey.index,
          column,
          corner,
          upperColumnId: upperColumn?.id,
          upperCorner,
          ho,
          directions,
          governing: governing.value,
        },
        'X・YそれぞれのNを求め大きい方を採用; 上階柱は0.3m以内の最寄り柱',
        `柱=${column.id}; 出隅=${corner}; 上階柱=${upperColumn?.id ?? 'なし'}; 上階出隅=${upperCorner}; N=${governing.value.n}`,
        N_VALUE_REFERENCES,
        [
          ...new Set(directions.flatMap((d) => d.explain.notes ?? [])),
          ...(ho > 3.2 ? ['横架材上端間距離が3.2m超のためN値計算法が必須。'] : []),
        ],
        directions.map((d) => d.explain),
      )
    }),
  )
  return explained(
    { rows },
    '柱ごとのN値と金物区分',
    `柱数=${rows.length}`,
    N_VALUE_REFERENCES,
    undefined,
    [walls.explain, ...rows.map((r) => r.explain)],
  )
}
