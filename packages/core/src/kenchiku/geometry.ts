import type { Pt } from '@nsfactory/kenchiku'
import { area, difference, union } from '../lib/polygon-boolean'
import { extractRooms } from '../lib/room-graph'
import type { WallNode } from '../schema'
import { getWallBodyLine } from '../systems/wall/wall-frame'

export function centerWall(wall: WallNode): WallNode {
  const { start, end } = getWallBodyLine(wall)
  return { ...wall, start: [start.x, start.y], end: [end.x, end.y], justification: undefined }
}

export function floorOutline(walls: WallNode[], openings: Pt[][]) {
  const rooms = extractRooms(walls.map(centerWall), { includeHoles: true })
  const footprint = union(
    rooms.map((room) => ({ outer: room.referencePolygon, holes: room.holes })),
  )
  if (footprint.length !== 1) throw new RangeError('床の壁芯外周を一つに確定できません')
  const cut = difference(footprint, union(openings.map((outer) => ({ outer, holes: [] }))))
  if (cut.length !== 1) throw new RangeError('吹抜け控除後の床外周を一つに確定できません')
  return { floorPolygon: cut[0]!.outer, holes: cut[0]!.holes, floorArea: area(cut) }
}

export function onEdge(point: Pt, polygon: Pt[], tolerance = 1e-4): boolean {
  return polygon.some((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!
    const dx = b[0] - a[0],
      dy = b[1] - a[1]
    const length = Math.hypot(dx, dy)
    if (!length) return false
    const u = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length
    return (
      u >= -tolerance &&
      u <= length + tolerance &&
      Math.abs((point[0] - a[0]) * dy - (point[1] - a[1]) * dx) / length <= tolerance
    )
  })
}

export function above(polygon: Pt[], cut: number): Pt[] {
  const result: Pt[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!,
      b = polygon[(i + 1) % polygon.length]!
    if (a[1] >= cut) result.push(a)
    if (a[1] >= cut !== b[1] >= cut) {
      result.push([a[0] + ((b[0] - a[0]) * (cut - a[1])) / (b[1] - a[1]), cut])
    }
  }
  return result
}

/** 平面の回転（three.js の Y 軸回転と同じ向き）: x' = x cos a + y sin a, y' = −x sin a + y cos a */
export function rot2(p: readonly [number, number], a: number): [number, number] {
  if (!a) return [p[0], p[1]]
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [p[0] * c + p[1] * s, -p[0] * s + p[1] * c]
}
