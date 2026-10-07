import type { FacadeArea, JpRoof, JpStorey, Pt } from '@nsfactory/kenchiku'
import { levelIdOf } from '../agent-operations/scene-queries'
import { area, union } from '../lib/polygon-boolean'
import type { AnyNode, BuildingNode, RoofNode, RoofSegmentNode } from '../schema'
import { getSegmentSlopeFrame } from '../schema/nodes/roof-segment'
import { getRoofModuleFaces, getRoofShapeRatios } from '../schema/nodes/roof-segment-shape'
import { getLevelElevations } from '../services/storey'
import { resolveRoofElevation } from '../systems/roof/roof-elevation'
import { above, rot2 } from './geometry'

export function roofInput(
  nodes: Record<string, AnyNode>,
  building: BuildingNode,
  segments: RoofSegmentNode[],
  storeys: JpStorey[],
  floors: number[],
  notes: string[],
  axisRotation = 0,
): { roof: JpRoof; facade: { x: FacadeArea[]; y: FacadeArea[] } } {
  const jp = building.jp
  if (!jp?.roofKind) throw new RangeError('屋根材（jp.roofKind）が未入力です')
  const elevations = getLevelElevations(nodes)
  const projections: { x: Pt[][]; y: Pt[][] } = { x: [], y: [] }
  const eaves: number[] = [],
    peaks: number[] = []
  for (const segment of segments) {
    const parent = segment.parentId ? nodes[segment.parentId] : undefined
    if (parent?.type !== 'roof') throw new RangeError('屋根セグメントの親が不明です')
    const roof = parent as RoofNode
    if (roof.support.kind === 'roof') {
      // TODO(spec §6.1): 屋根面に従属する屋根の支持高さを純粋な共通サービスで解決する。
      throw new RangeError('屋根面に従属する屋根は見付面積を確定できません')
    }
    const { activeRh, tanTheta } = getSegmentSlopeFrame(segment)
    const base =
      (elevations.get(levelIdOf(nodes, roof.id) ?? '')?.baseY ?? 0) +
      resolveRoofElevation(roof, nodes) +
      segment.position[1]
    eaves.push(base + segment.wallHeight)
    peaks.push(base + segment.wallHeight + activeRh)
    const faces = getRoofModuleFaces({
      type: segment.roofType,
      w: segment.width + 2 * segment.overhang,
      d: segment.depth + 2 * segment.overhang,
      wh: segment.wallHeight,
      rh: activeRh || 0.15,
      baseY: segment.wallHeight,
      insets: {},
      baseW: segment.width,
      baseD: segment.depth,
      tanTheta,
      shapeRatios: getRoofShapeRatios(segment),
      conicalStartAngle: segment.conicalStartAngle,
      conicalSweepAngle: segment.conicalSweepAngle,
    })
    const rotate = (x: number, z: number, angle: number): Pt => [
      x * Math.cos(angle) + z * Math.sin(angle),
      -x * Math.sin(angle) + z * Math.cos(angle),
    ]
    for (const face of faces) {
      const vertices = face.map((v) => {
        const local = rotate(v.x, v.z, segment.rotation)
        const p = rotate(
          local[0] + segment.position[0],
          local[1] + segment.position[2],
          roof.rotation,
        )
        const planar = rot2([p[0] + roof.position[0], p[1] + roof.position[2]], axisRotation)
        return [planar[0], base + v.y, planar[1]]
      })
      projections.x.push(vertices.map((p): Pt => [p[2]!, p[1]!]))
      projections.y.push(vertices.map((p): Pt => [p[0]!, p[1]!]))
    }
  }
  const rise =
    jp.roofRiseOverride ?? (segments.length ? Math.max(...peaks) - Math.min(...eaves) : undefined)
  const overhang =
    jp.overhangOverride ??
    (segments.length ? Math.max(...segments.map((s) => s.overhang)) : undefined)
  const pitchSun =
    jp.pitchSunOverride ??
    (segments.length
      ? Math.max(...segments.map((s) => Math.tan((s.pitch * Math.PI) / 180) * 10))
      : undefined)
  // 屋根が無く上書きも無いときは 4寸の切妻を仮定して計算を止めない（図書と注記に明示する）。
  const assumed = rise === undefined || overhang === undefined || pitchSun === undefined
  const top = storeys.at(-1)!
  const spanX =
    Math.max(...top.floorPolygon.map((p) => p[0])) - Math.min(...top.floorPolygon.map((p) => p[0]))
  const spanY =
    Math.max(...top.floorPolygon.map((p) => p[1])) - Math.min(...top.floorPolygon.map((p) => p[1]))
  const pitchSunUsed = pitchSun ?? 4
  const overhangUsed = overhang ?? 0.45
  const riseUsed = rise ?? ((Math.min(spanX, spanY) + 2 * overhangUsed) / 2) * (pitchSunUsed / 10)
  if (assumed)
    notes.push(
      `屋根ノードが無いため、勾配 ${pitchSunUsed} 寸・軒の出 ${overhangUsed} m・短辺に棟を置く切妻（最高高さ−軒高 ${riseUsed.toFixed(2)} m）を仮定。屋根を描くか「建物の仕様」で上書きすると実際の値になる。`,
    )
  const roof: JpRoof = {
    kind: jp.roofKind,
    rise: riseUsed,
    overhang: overhangUsed,
    pitchSun: pitchSunUsed,
  }
  notes.push(
    '屋根はcoreの形状面を立面へ投影しunion。軒は水平にoverhangだけ拡張し、厚さ・トリムを省いた近似。陸屋根は0.15m帯。複数勾配・軒の出は最大値。',
  )
  if (
    !segments.length ||
    jp.roofRiseOverride !== undefined ||
    jp.overhangOverride !== undefined ||
    jp.pitchSunOverride !== undefined
  ) {
    const top = storeys.at(-1)!
    const eave = floors.at(-1)! + top.height
    for (const direction of ['x', 'y'] as const) {
      const axis = direction === 'x' ? 1 : 0
      const values = top.floorPolygon.map((p) => p[axis])
      const lo = Math.min(...values) - overhangUsed,
        hi = Math.max(...values) + overhangUsed
      projections[direction] = [
        riseUsed > 0
          ? [
              [lo, eave],
              [(lo + hi) / 2, eave + riseUsed],
              [hi, eave],
            ]
          : [
              [lo, eave],
              [hi, eave],
              [hi, eave + 0.15],
              [lo, eave + 0.15],
            ],
      ]
    }
    notes.push(
      '屋根諸元の上書きまたは屋根ノード欠落時は、最上階外周幅の切妻三角形（rise=0は0.15m帯）で見付面積を近似。',
    )
  }
  const facade = { x: [] as FacadeArea[], y: [] as FacadeArea[] }
  for (const direction of ['x', 'y'] as const) {
    const axis = direction === 'x' ? 1 : 0
    facade[direction] = storeys.map((storey, i) => {
      const cut = floors[i]! + 1.35
      const parts = storeys.slice(i).map((s, offset) => {
        const bottom = floors[i + offset]!
        const height = Math.max(0, bottom + s.height - Math.max(bottom, cut))
        const values = s.floorPolygon.map((p) => p[axis])
        const width = Math.max(...values) - Math.min(...values)
        return { label: `${s.index}階壁`, width, height, area: width * height }
      })
      const roofArea = area(
        union(
          projections[direction]
            .map((p) => ({ outer: above(p, cut), holes: [] }))
            .filter((p) => p.outer.length >= 3 && area([p]) > 1e-6),
        ),
      )
      parts.push({ label: '屋根', width: 0, height: riseUsed, area: roofArea })
      return {
        storey: storey.index,
        parts,
        area: parts.reduce((sum, part) => sum + part.area, 0),
        notes: [...notes],
      }
    })
  }
  return { roof, facade }
}
