import {
  type Explained,
  type JpBearingSpec,
  type JpBuildingInput,
  type JpColumn,
  type JpOpening,
  type JpRoom,
  type JpSiteInput,
  type JpStorey,
  type JpWall,
  REFERENCES,
  TIMBER_FC,
} from '@nsfactory/kenchiku'
import { wallResolvedHeight } from '../agent-operations/level-reads'
import { descendantsOf, levelRole, levelsOf, nodesOnLevel } from '../agent-operations/scene-queries'
import { area } from '../lib/polygon-boolean'
import type {
  AnyNode,
  BuildingNode,
  ColumnNode,
  DoorNode,
  FloorOpeningNode,
  LevelNode,
  SiteNode,
  StairNode,
  WallNode,
  WindowNode,
  ZoneNode,
} from '../schema'
import {
  getLevelElevations,
  getLevelFloorToFloorHeight,
  getStoredLevelHeight,
} from '../services/storey'
import { measureStair } from '../systems/stair/stair-sizing'
import { centerWall, floorOutline, onEdge, rot2 } from './geometry'
import { roofInput } from './roof'

const isWall = (n: AnyNode): n is WallNode => n.type === 'wall'
const isZone = (n: AnyNode): n is ZoneNode => n.type === 'zone'
const isStair = (n: AnyNode): n is StairNode => n.type === 'stair'
const isColumn = (n: AnyNode): n is ColumnNode => n.type === 'column'
const isFloorOpening = (n: AnyNode): n is FloorOpeningNode => n.type === 'floor-opening'
const isOpening = (n: AnyNode): n is DoorNode | WindowNode =>
  n.type === 'door' || n.type === 'window'

/** 図書に 0.8999999 のような浮動小数の屑を出さない。 */
const round6 = (x: number) => Math.round(x * 1e6) / 1e6

const DEFAULT_TIMBER = { standard: '無等級材', species: 'すぎ', grade: '', fc: 17.7 }

function opening(node: DoorNode | WindowNode): JpOpening {
  // 壁の子は壁始点からの u（中心）と壁基準面からの中心高さを持つ（wall-openings.ts の clamp と同じ約束）。
  return {
    u: round6(node.position[0]),
    width: round6(node.width),
    bottom: round6(node.position[1] - node.height / 2),
    height: round6(node.height),
    kind: node.openingKind,
  }
}

function bearing(wall: WallNode): JpBearingSpec | undefined {
  const source = wall.jp?.bearing
  if (!source) return undefined
  const kinds = source.kinds.filter((kind) => kind !== 'combined')
  if (!kinds.length) return undefined
  const components = kinds.map((kind) => ({
    kind,
    ratioOverride: source.ratioOverride,
    faces: source.faces,
  }))
  const spec: JpBearingSpec =
    components.length === 1 ? components[0]! : { kind: 'combined', components }
  return source.quasi ? { ...spec, quasi: source.quasi } : spec
}

function midpoint(wall: Pick<WallNode, 'start' | 'end'>): [number, number] {
  return [(wall.start[0] + wall.end[0]) / 2, (wall.start[1] + wall.end[1]) / 2]
}

function timberFor(building: BuildingNode, notes: string[]) {
  const requested = building.jp?.timber
  if (!requested) return { ...DEFAULT_TIMBER }
  const match = TIMBER_FC.find(
    (t) =>
      t.standard === requested.standard &&
      t.species === requested.species &&
      t.grade === requested.grade,
  )
  if (match) return { ...match }
  notes.push(
    `木材「${requested.standard}/${requested.species}/${requested.grade}」が強度表に無いため、すぎ無等級材（Fc 17.7）で計算。`,
  )
  return { ...DEFAULT_TIMBER }
}

/**
 * 壁の主方向（長さで重み付けした 90° 周期の平均角・rad）。建物が level の軸に対して斜めに
 * 描かれていても、この角だけ回せば X/Y 方向の壁として集計できる。±0.5° 未満は 0。
 */
export function dominantAxisAngle(walls: readonly Pick<WallNode, 'start' | 'end'>[]): number {
  let sx = 0
  let sy = 0
  for (const w of walls) {
    const dx = w.end[0] - w.start[0]
    const dy = w.end[1] - w.start[1]
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) continue
    const a4 = 4 * Math.atan2(dy, dx)
    sx += len * Math.cos(a4)
    sy += len * Math.sin(a4)
  }
  if (Math.hypot(sx, sy) < 1e-9) return 0
  const angle = Math.atan2(sy, sx) / 4
  return Math.abs(angle) < (0.5 * Math.PI) / 180 ? 0 : angle
}

/**
 * 敷地を建物座標（建物の位置・回転を戻し、さらに壁の主方向の回転 θ を掛けた座標）へ移す。
 * 真北は方向ベクトルとして同じ回転を受ける。
 */
function siteInput(
  site: SiteNode | undefined,
  building: BuildingNode,
  axisRotation: number,
): JpSiteInput | undefined {
  if (!site) return undefined
  const rotB = building.rotation?.[1] ?? 0
  const px = building.position?.[0] ?? 0
  const pz = building.position?.[2] ?? 0
  const toAxis = (p: readonly [number, number]): [number, number] =>
    rot2(rot2([p[0] - px, p[1] - pz], -rotB), axisRotation)
  const north = site.northRotation ?? 0
  const n = rot2([Math.sin(north), -Math.cos(north)], axisRotation - rotB)
  return {
    polygon: site.polygon?.points?.map(toAxis),
    northRotation: Math.atan2(n[0], -n[1]),
    ...(site.jp ?? {}),
  }
}

/** 対象の建物。id 指定が無ければシーン内に1つだけある建物。 */
export function findJpBuilding(nodes: Record<string, AnyNode>, buildingId?: string): BuildingNode {
  const buildings = Object.values(nodes).filter((n): n is BuildingNode => n.type === 'building')
  const building = buildingId
    ? buildings.find((b) => b.id === buildingId)
    : buildings.length === 1
      ? buildings[0]
      : undefined
  if (!building)
    throw new RangeError('対象の建物を一つ指定してください（building ノードが0または複数）')
  return building
}

/** 計算対象の階（占有階）を下から順に。storeys[i] がこの i 番目の level に対応する。 */
export function jpStoreyLevels(
  nodes: Record<string, AnyNode>,
  building: BuildingNode,
): LevelNode[] {
  const elevations = getLevelElevations(nodes)
  return levelsOf(nodes)
    .filter(
      (l): l is LevelNode =>
        (l.parentId === building.id || building.children.includes(l.id)) &&
        levelRole(nodes, l).role === 'occupied',
    )
    .sort((a, b) => (elevations.get(a.id)?.baseY ?? 0) - (elevations.get(b.id)?.baseY ?? 0))
}

/**
 * 仕様書 §6.1: シーングラフ → `@nsfactory/kenchiku` の入力モデル。
 * level 内の座標は建物ローカル（X=x、Y=z）なので建物の回転は戻さない。
 * 未入力の仕様は既定値で補い、その旨を explain.notes に残す（判定を止めない）。
 */
export function adaptJpBuilding(
  nodes: Record<string, AnyNode>,
  buildingId?: string,
): Explained<JpBuildingInput> {
  const building = findJpBuilding(nodes, buildingId)
  const jp = building.jp
  if (jp?.structure && jp.structure !== 'wood-conventional')
    throw new RangeError('フェーズAは木造在来軸組（wood-conventional）だけが対象です')

  const notes: string[] = [
    '壁・部屋は保存済みの建物ローカル座標（X=x、Y=z）を使用。建物の位置・回転に依存しない。',
    '壁芯は wall-frame で中心線へ正規化し、room-graph の壁芯ポリゴンを union。床面積は座標法で吹抜けを控除（図書に許容誤差±1%を注記）。',
    '見付面積の壁は各階外周の投影幅 ×（床面+1.35m より上の高さ）で近似。',
  ]
  if (!jp?.extWall) notes.push('外壁材（jp.extWall）が未入力のため「サイディング」で計算。')
  if (!jp?.roofKind) notes.push('屋根材（jp.roofKind）が未入力のため「スレート屋根」で計算。')

  const parent = building.parentId ? nodes[building.parentId] : undefined
  const site = parent?.type === 'site' ? (parent as SiteNode) : undefined
  const siteJp = site?.jp

  const elevations = getLevelElevations(nodes)
  const levels = jpStoreyLevels(nodes, building)
  if (!levels.length) throw new RangeError('壁や部屋のある階（占有階）がありません')
  if (levels.length > 3) throw new RangeError('フェーズAは階数3以下が対象です')

  const axisRotation = dominantAxisAngle(
    levels.flatMap((level) => nodesOnLevel(nodes, level.id).filter(isWall).map(centerWall)),
  )
  if (axisRotation)
    notes.push(
      `壁の主方向が平面の x 軸から ${((axisRotation * 180) / Math.PI).toFixed(1)}° 傾いているため、建物座標を同じ角だけ回して X/Y 方向を定義（図面上の位置は元のまま）。`,
    )
  const toAxis = (p: readonly [number, number]) => rot2(p, axisRotation)
  const rotateWall = (wall: WallNode): WallNode => {
    const centered = centerWall(wall)
    return { ...centered, start: toAxis(centered.start), end: toAxis(centered.end) }
  }

  const storeys: JpStorey[] = levels.map((level, i) => {
    const content = nodesOnLevel(nodes, level.id)
    const sourceWalls = content.filter(isWall)
    const voids = content
      .filter(isFloorOpening)
      .filter((n) => n.drawnOn === 'floor' && n.cutsPrimary && !n.hostZoneId)
      .map((n) => n.polygon.map(toAxis))
    const below = levels[i - 1]
    if (below) {
      voids.push(
        ...nodesOnLevel(nodes, below.id)
          .filter(isFloorOpening)
          .filter((n) => n.drawnOn === 'ceiling' && n.cutsAdjacent && !n.hostZoneId)
          .map((n) => n.polygon.map(toAxis)),
      )
    }
    const rotatedWalls = sourceWalls.map(rotateWall)
    const outline = floorOutline(rotatedWalls, voids)
    const height =
      i === levels.length - 1
        ? getStoredLevelHeight(level)
        : getLevelFloorToFloorHeight(level.id, nodes)

    const walls: JpWall[] = sourceWalls.map((wall, k) => {
      const centered = rotatedWalls[k]!
      const children = descendantsOf(nodes, wall.id).filter(isOpening)
      return {
        id: wall.id,
        start: centered.start,
        end: centered.end,
        thickness: wall.thickness ?? 0.1,
        height: wallResolvedHeight(nodes, wall),
        openings: children.map(opening),
        bearing: bearing(wall),
        curveOffset: wall.curveOffset,
        exterior: wall.jp?.exterior ?? onEdge(midpoint(centered), outline.floorPolygon),
      }
    })
    const diagonal = walls.filter((w) => {
      const angle = Math.atan2(Math.abs(w.end[1] - w.start[1]), Math.abs(w.end[0] - w.start[0]))
      return !w.curveOffset && angle > Math.PI / 8 && angle < (3 * Math.PI) / 8
    }).length
    const curved = walls.filter((w) => w.curveOffset).length
    if (diagonal || curved)
      notes.push(`${i + 1}階: 斜め壁（集計外）${diagonal}本、曲面壁（集計外）${curved}本。`)

    const rooms: JpRoom[] = content
      .filter(isZone)
      .filter((zone) => zone.spaceRole === 'room' || zone.jp?.roomKind)
      .map((zone) => {
        const kind = zone.jp?.roomKind ?? 'living'
        if (!zone.jp?.roomKind)
          notes.push(
            `${zone.name || zone.id}: 室の種別（jp.roomKind）が未入力のため居室として扱う（安全側）。`,
          )
        const roomPolygon = zone.polygon.map(toAxis)
        const roomWalls = sourceWalls.filter(
          (w, k) =>
            zone.boundaryWallIds.includes(w.id) ||
            onEdge(midpoint(rotatedWalls[k]!), roomPolygon, (w.thickness ?? 0.1) / 2 + 1e-4),
        )
        return {
          id: zone.id,
          name: zone.name,
          polygon: roomPolygon,
          area: area([{ outer: roomPolygon, holes: zone.holes.map((h) => h.map(toAxis)) }]),
          kind,
          ceilingHeight: zone.ceilingHeight,
          daylightNeighborDistance: zone.jp?.daylightNeighborDistance,
          windows: roomWalls.flatMap((w) =>
            descendantsOf(nodes, w.id)
              .filter((n): n is WindowNode => n.type === 'window' && n.openingKind === 'window')
              .map(opening),
          ),
        }
      })

    const stairs = content.filter(isStair).flatMap((stair) =>
      measureStair(stair, nodes).flights.flatMap((flight) => {
        if (flight.riserHeight === null || flight.going === null) {
          notes.push(`${stair.id}: 階段寸法を計測できないため階段の検討から除外。`)
          return []
        }
        return [
          {
            id: flight.nodeId,
            riser: flight.riserHeight,
            tread: flight.going,
            width: flight.width,
          },
        ]
      }),
    )

    const columns: JpColumn[] = content.filter(isColumn).map((column) => {
      if (column.crossSection !== 'rectangular' && column.crossSection !== 'square')
        notes.push(`${column.id}: 矩形以外の柱断面は小径比較の対象外。`)
      const rectangular = column.crossSection === 'rectangular' || column.crossSection === 'square'
      return {
        id: column.id,
        at: toAxis([column.position[0], column.position[2]]),
        sizeMm: rectangular ? [column.width * 1000, column.depth * 1000] : undefined,
      }
    })

    return {
      index: (i + 1) as 1 | 2 | 3,
      height,
      floorPolygon: outline.floorPolygon,
      holes: outline.holes,
      floorArea: outline.floorArea,
      walls,
      rooms,
      stairs,
      columns,
    }
  })

  const floors = levels.map((l) => elevations.get(l.id)?.baseY ?? 0)
  const roofs = descendantsOf(nodes, building.id).filter(
    (n): n is Extract<AnyNode, { type: 'roof-segment' }> => n.type === 'roof-segment',
  )
  const effectiveBuilding: BuildingNode = {
    ...building,
    jp: { ...(jp ?? { structure: 'wood-conventional' }), roofKind: jp?.roofKind ?? 'slate' },
  }
  const geometry = roofInput(nodes, effectiveBuilding, roofs, storeys, floors, notes, axisRotation)

  const value: JpBuildingInput = {
    storeys,
    roof: geometry.roof,
    facade: geometry.facade,
    extWall: jp?.extWall ?? 'siding',
    pv: jp?.pv ?? { kind: 'none' },
    ceilingInsulationNPerM2: jp?.ceilingInsulationNPerM2 ?? 100,
    wallInsulationNPerM2: jp?.wallInsulationNPerM2 ?? 70,
    use: jp?.use ?? 'house',
    c0: siteJp?.seismicC0 ?? 0.2,
    windCoef: siteJp?.windCoef ?? 50,
    snow: siteJp?.snow,
    timber: timberFor(building, notes),
    minBearingLength: jp?.minBearingLength ?? 0.9,
    quasiWalls: jp?.quasiWalls ?? false,
    site: siteInput(site, building, axisRotation),
    foundation: jp?.foundation,
    axisRotation,
  }
  return {
    value,
    explain: {
      formula: 'シーングラフ → 建物ローカルの壁芯床面積・開口・屋根の鉛直投影',
      substituted: `${building.id}: ${storeys.length}階、床面積=${storeys
        .map((s) => s.floorArea.toFixed(2))
        .join('/')}㎡`,
      references: [REFERENCES.wall],
      notes,
    },
  }
}
