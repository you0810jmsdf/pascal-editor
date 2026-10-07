import type { JpBuildingInput, JpStorey, Pt } from '../model'
import { distance, EPS, signedArea } from '../structural/polygon'

export const areaOf = (polygon: Pt[]) => Math.abs(signedArea(polygon))

/** 点から線分までの最短距離 */
export function pointToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t =
    len2 <= EPS ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return distance(p, [a[0] + t * dx, a[1] + t * dy])
}

export const edgesOf = (polygon: Pt[]): [Pt, Pt][] =>
  polygon.map((p, i) => [p, polygon[(i + 1) % polygon.length]!])

/** 多角形 A の辺・頂点と多角形 B の辺・頂点の最短距離（辺同士が交差しない前提の近似） */
export function polygonDistance(a: Pt[], b: Pt[]): number {
  let best = Number.POSITIVE_INFINITY
  for (const p of a) for (const [s, e] of edgesOf(b)) best = Math.min(best, pointToSegment(p, s, e))
  for (const p of b) for (const [s, e] of edgesOf(a)) best = Math.min(best, pointToSegment(p, s, e))
  return best
}

/** 点から 1 本の辺（線分）までの距離の、多角形頂点に関する最小値 */
export function minDistanceToEdge(points: Pt[], edge: [Pt, Pt]): number {
  return Math.min(...points.map((p) => pointToSegment(p, edge[0], edge[1])))
}

/**
 * 点 p から方向 dir（単位ベクトル）に伸ばした半直線が多角形の辺と最初に交わるまでの距離。
 * 交わらなければ null。p が多角形の内側にあることを前提とする（北側斜線の d）。
 */
export function rayToBoundary(
  p: Pt,
  dir: Pt,
  polygon: Pt[],
): { distance: number; edgeIndex: number } | null {
  let best: { distance: number; edgeIndex: number } | null = null
  edgesOf(polygon).forEach(([a, b], edgeIndex) => {
    const ex = b[0] - a[0]
    const ey = b[1] - a[1]
    const denom = dir[0] * ey - dir[1] * ex
    if (Math.abs(denom) <= EPS) return
    const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / denom // 半直線上の距離
    const u = ((a[0] - p[0]) * dir[1] - (a[1] - p[1]) * dir[0]) / denom // 辺上の位置 0..1
    if (t > EPS && u >= -EPS && u <= 1 + EPS && (best === null || t < best.distance))
      best = { distance: t, edgeIndex }
  })
  return best
}

/** 真北の単位ベクトル。northRotation は「真北の、平面の上（−y）からの時計回りの回転（rad）」。 */
export function northVector(northRotation = 0): Pt {
  return [Math.sin(northRotation), -Math.cos(northRotation)]
}

/** 壁の始点から u の位置の平面座標 */
export function pointOnWall(start: Pt, end: Pt, u: number): Pt {
  const len = distance(start, end)
  if (len <= EPS) return start
  const t = u / len
  return [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]
}

/** 建物の高さ（最高高さ）と軒高（m・1階床面基準）。基礎・土台の高さは含めない。 */
export function buildingHeights(input: JpBuildingInput) {
  const eave = input.storeys.reduce((sum, s) => sum + s.height, 0)
  return { eave, top: eave + input.roof.rise }
}

/** 各階の床面の高さ（1階床面を 0 とする） */
export function floorLevels(storeys: JpStorey[]): number[] {
  const levels: number[] = []
  let y = 0
  for (const s of storeys) {
    levels.push(y)
    y += s.height
  }
  return levels
}

/** 建築面積の近似：各階の床面積ポリゴンのうち最大のもの（上階の張り出しを拾う）。1m を超える軒の出は未考慮。 */
export function buildingAreaPolygon(input: JpBuildingInput): { polygon: Pt[]; area: number } {
  let best = input.storeys[0]!
  for (const s of input.storeys) if (s.floorArea > best.floorArea) best = s
  return { polygon: best.floorPolygon, area: best.floorArea }
}

export const totalFloorArea = (input: JpBuildingInput) =>
  input.storeys.reduce((sum, s) => sum + s.floorArea, 0)

export function fmt(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '－'
}
