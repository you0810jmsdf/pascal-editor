import type { Pt } from '../model'

export const EPS = 1e-9
export const distance = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

export function signedArea(polygon: Pt[]): number {
  return (
    polygon.reduce((sum, p, i) => {
      const q = polygon[(i + 1) % polygon.length]!
      return sum + p[0] * q[1] - q[0] * p[1]
    }, 0) / 2
  )
}

export function validatePolygon(polygon: Pt[]): void {
  if (
    polygon.length < 3 ||
    polygon.some((p) => p.some((v) => !Number.isFinite(v))) ||
    Math.abs(signedArea(polygon)) <= EPS
  )
    throw new RangeError('有限座標と面積を持つ床面積ポリゴンが必要です')
}

// 半平面で切る。凹形が分離する場合の境界上の往復辺は面積計算で相殺される。
function clip(polygon: Pt[], axis: 0 | 1, bound: number, above: boolean): Pt[] {
  const result: Pt[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const insideA = above ? a[axis] >= bound : a[axis] <= bound
    const insideB = above ? b[axis] >= bound : b[axis] <= bound
    if (insideA) result.push(a)
    if (insideA !== insideB) {
      const t = (bound - a[axis]) / (b[axis] - a[axis])
      result.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
    }
  }
  return result
}

export function clipBand(polygon: Pt[], axis: 0 | 1, min: number, max: number): Pt[] {
  return clip(clip(polygon, axis, min, true), axis, max, false)
}

export function isCorner(at: Pt, polygon: Pt[]): boolean {
  const ring = distance(polygon[0]!, polygon.at(-1)!) <= EPS ? polygon.slice(0, -1) : polygon
  const orientation = Math.sign(signedArea(ring))
  return ring.some((p, i) => {
    const prev = ring[(i + ring.length - 1) % ring.length]!
    const next = ring[(i + 1) % ring.length]!
    const cross = (p[0] - prev[0]) * (next[1] - p[1]) - (p[1] - prev[1]) * (next[0] - p[0])
    return cross * orientation > EPS && distance(at, p) <= 0.3 + EPS
  })
}
