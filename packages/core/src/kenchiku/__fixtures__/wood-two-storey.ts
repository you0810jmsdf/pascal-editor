import { type AnyNode, AnyNode as AnyNodeSchema } from '../../schema'

/**
 * 仕様書 §11 の検証用シーン: 木造2階建て 7.28m × 9.1m（壁芯）。
 * 各階に外壁4枚（厚さ0.12）＋間仕切2枚、南の外壁にドア1＋窓1、他の外壁に窓1ずつ、
 * 部屋（zone）1つ。屋根は `withRoof` のときだけ切妻の roof-segment を1つ載せる。
 * 各ノードは zod スキーマで parse して既定値を埋める（旧シーンと同じ読み込み経路）。
 */
export const FIXTURE_W = 7.28
export const FIXTURE_D = 9.1
export const FIXTURE_H1 = 2.9
export const FIXTURE_H2 = 2.8

type Raw = Record<string, unknown> & { id: string; type: string }

function parseAll(raws: Raw[]): Record<string, AnyNode> {
  const nodes: Record<string, AnyNode> = {}
  for (const raw of raws) nodes[raw.id] = AnyNodeSchema.parse(raw) as AnyNode
  return nodes
}

function storeyNodes(levelId: string, index: number, zoneKind?: string): Raw[] {
  const w = (suffix: string, start: [number, number], end: [number, number], extra: object = {}) => ({
    id: `wall_${index}${suffix}`,
    type: 'wall',
    parentId: levelId,
    start,
    end,
    thickness: 0.12,
    ...extra,
  })
  const walls: Raw[] = [
    w('s', [0, 0], [FIXTURE_W, 0], { children: [`door_${index}s`, `window_${index}s`] }),
    w('e', [FIXTURE_W, 0], [FIXTURE_W, FIXTURE_D], { children: [`window_${index}e`] }),
    w('n', [FIXTURE_W, FIXTURE_D], [0, FIXTURE_D], { children: [`window_${index}n`] }),
    w('w', [0, FIXTURE_D], [0, 0], { children: [`window_${index}w`] }),
    w('ix', [0, 4.55], [FIXTURE_W, 4.55]),
    w('iy', [3.64, 0], [3.64, 4.55]),
  ]
  const window = (suffix: string, wall: string, u: number) => ({
    id: `window_${index}${suffix}`,
    type: 'window',
    parentId: wall,
    wallId: wall,
    position: [u, 1.45, 0],
    width: 1.65,
    height: 1.1,
  })
  const openings: Raw[] = [
    {
      id: `door_${index}s`,
      type: 'door',
      parentId: `wall_${index}s`,
      wallId: `wall_${index}s`,
      position: [1.0, 1.0, 0],
      width: 0.8,
      height: 2.0,
    },
    window('s', `wall_${index}s`, 5.0),
    window('e', `wall_${index}e`, 2.5),
    window('n', `wall_${index}n`, 3.0),
    window('w', `wall_${index}w`, 6.0),
  ]
  const zone: Raw = {
    id: `zone_${index}`,
    type: 'zone',
    parentId: levelId,
    name: index === 1 ? 'LDK' : '寝室',
    polygon: [
      [0.06, 0.06],
      [3.58, 0.06],
      [3.58, 4.49],
      [0.06, 4.49],
    ],
    spaceRole: 'room',
    ceilingHeight: 2.4,
    ...(zoneKind ? { jp: { roomKind: zoneKind } } : {}),
  }
  return [...walls, ...openings, zone]
}

export function woodTwoStoreyScene(options: { withRoof?: boolean; siteJp?: object; buildingJp?: object } = {}) {
  const { withRoof = false, siteJp, buildingJp } = options
  const level1Children = storeyNodes('level_1', 1, 'living').filter((n) => n.parentId === 'level_1')
  const level2Children = storeyNodes('level_2', 2).filter((n) => n.parentId === 'level_2')
  const raws: Raw[] = [
    {
      id: 'site_1',
      type: 'site',
      parentId: null,
      polygon: {
        type: 'polygon',
        points: [
          [-3, -4],
          [12, -4],
          [12, 14],
          [-3, 14],
        ],
      },
      northRotation: 0,
      children: ['building_1'],
      ...(siteJp ? { jp: siteJp } : {}),
    },
    {
      id: 'building_1',
      type: 'building',
      parentId: 'site_1',
      children: ['level_1', 'level_2'],
      ...(buildingJp ? { jp: buildingJp } : {}),
    },
    {
      id: 'level_1',
      type: 'level',
      parentId: 'building_1',
      level: 0,
      height: FIXTURE_H1,
      children: level1Children.map((n) => n.id),
    },
    {
      id: 'level_2',
      type: 'level',
      parentId: 'building_1',
      level: 1,
      height: FIXTURE_H2,
      children: [...level2Children.map((n) => n.id), ...(withRoof ? ['roof_1'] : [])],
    },
    ...storeyNodes('level_1', 1, 'living'),
    ...storeyNodes('level_2', 2),
  ]
  if (withRoof) {
    raws.push(
      {
        id: 'roof_1',
        type: 'roof',
        parentId: 'level_2',
        position: [FIXTURE_W / 2, 0, FIXTURE_D / 2],
        children: ['rseg_1'],
      },
      {
        id: 'rseg_1',
        type: 'roof-segment',
        parentId: 'roof_1',
        roofType: 'gable',
        width: FIXTURE_W,
        depth: FIXTURE_D,
        pitch: 21.8,
        overhang: 0.5,
        wallHeight: 0.3,
      },
    )
  }
  return parseAll(raws)
}
