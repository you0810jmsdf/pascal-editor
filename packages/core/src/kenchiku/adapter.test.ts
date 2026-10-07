import { describe, expect, test } from 'bun:test'
import { existingWall, requiredWall } from '@nsfactory/kenchiku'
import { type AnyNode, AnyNode as AnyNodeSchema } from '../schema'
import {
  FIXTURE_D,
  FIXTURE_H1,
  FIXTURE_H2,
  FIXTURE_W,
  woodTwoStoreyScene,
} from './__fixtures__/wood-two-storey'
import { adaptJpBuilding } from './adapter'

const BUILDING_JP = {
  roofKind: 'slate',
  extWall: 'siding',
  roofRiseOverride: 1.2,
  overhangOverride: 0.5,
  pitchSunOverride: 4,
}

describe('adaptJpBuilding（仕様書 §6.1）', () => {
  test('床面積は壁芯 7.28×9.1 の ±1%、階高・壁・開口・部屋・敷地を取り出す', () => {
    const nodes = woodTwoStoreyScene({ buildingJp: BUILDING_JP, siteJp: { seismicC0: 0.3 } })
    const { value, explain } = adaptJpBuilding(nodes)

    expect(value.storeys).toHaveLength(2)
    const expectedArea = FIXTURE_W * FIXTURE_D
    for (const storey of value.storeys) {
      expect(Math.abs(storey.floorArea - expectedArea) / expectedArea).toBeLessThan(0.01)
      expect(storey.walls).toHaveLength(6)
      expect(storey.walls.filter((w) => w.exterior)).toHaveLength(4)
      expect(storey.rooms).toHaveLength(1)
    }
    expect(value.storeys[0]!.height).toBeCloseTo(FIXTURE_H1, 6)
    expect(value.storeys[1]!.height).toBeCloseTo(FIXTURE_H2, 6)

    const south = value.storeys[0]!.walls.find((w) => w.id === 'wall_1s')!
    expect(south.openings).toEqual([
      { u: 1.0, width: 0.8, bottom: 0, height: 2.0, kind: 'door' },
      { u: 5.0, width: 1.65, bottom: 0.9, height: 1.1, kind: 'window' },
    ])
    expect(south.exterior).toBe(true)
    expect(value.storeys[0]!.walls.find((w) => w.id === 'wall_1ix')!.exterior).toBe(false)

    const room = value.storeys[0]!.rooms![0]!
    expect(room.kind).toBe('living')
    expect(room.area).toBeCloseTo(3.52 * 4.43, 3)
    expect(room.ceilingHeight).toBe(2.4)
    // 部屋に面する外壁の窓だけを拾う（南・西の窓）
    expect(room.windows.length).toBeGreaterThanOrEqual(1)

    expect(value.roof).toEqual({ kind: 'slate', rise: 1.2, overhang: 0.5, pitchSun: 4 })
    expect(value.extWall).toBe('siding')
    expect(value.c0).toBe(0.3)
    expect(value.windCoef).toBe(50)
    expect(value.timber).toMatchObject({ species: 'すぎ', fc: 17.7 })
    expect(value.site?.polygon).toHaveLength(4)
    expect(value.site?.seismicC0).toBe(0.3)
    expect(value.facade!.x[0]!.area).toBeGreaterThan(0)
    expect(value.facade!.y[1]!.area).toBeGreaterThan(0)
    expect(explain.notes.length).toBeGreaterThan(0)
  })

  test('2階の部屋は roomKind 未入力でも居室として扱い、注記を残す', () => {
    const { value, explain } = adaptJpBuilding(woodTwoStoreyScene({ buildingJp: BUILDING_JP }))
    expect(value.storeys[1]!.rooms![0]!.kind).toBe('living')
    expect(explain.notes.some((n) => n.includes('roomKind'))).toBe(true)
  })

  test('仕様が未入力でも既定値（サイディング・スレート）で計算し注記する', () => {
    const { value, explain } = adaptJpBuilding(
      woodTwoStoreyScene({
        buildingJp: { roofRiseOverride: 1.0, overhangOverride: 0.45, pitchSunOverride: 4 },
      }),
    )
    expect(value.extWall).toBe('siding')
    expect(value.roof.kind).toBe('slate')
    expect(explain.notes.some((n) => n.includes('extWall'))).toBe(true)
  })

  test('屋根ノードから屋根諸元と見付面積を求める（切妻・4寸相当）', () => {
    const { value } = adaptJpBuilding(
      woodTwoStoreyScene({ withRoof: true, buildingJp: { roofKind: 'tile', extWall: 'mortar' } }),
    )
    expect(value.roof.kind).toBe('tile')
    expect(value.roof.overhang).toBeCloseTo(0.5, 6)
    expect(value.roof.pitchSun).toBeCloseTo(4, 1)
    expect(value.roof.rise).toBeGreaterThan(0.5)
    expect(value.roof.rise).toBeLessThan(3)
    expect(value.facade!.x[1]!.area).toBeGreaterThan(0)
  })

  test('アダプタの出力はそのままエンジンに渡せる（必要壁量・存在壁量・判定）', () => {
    const nodes = woodTwoStoreyScene({ buildingJp: BUILDING_JP })
    for (const id of [
      'wall_1s',
      'wall_1e',
      'wall_1n',
      'wall_1w',
      'wall_2s',
      'wall_2e',
      'wall_2n',
      'wall_2w',
    ]) {
      const wall = nodes[id] as AnyNode & { type: 'wall' }
      nodes[id] = { ...wall, jp: { bearing: { kinds: ['panel-plywood'] } } } as AnyNode
    }
    const input = adaptJpBuilding(nodes).value
    const required = requiredWall(input)
    expect(required.value.lw[0]).toBeGreaterThan(required.value.lw[1]!)
    const existing = existingWall(input)
    expect(existing.value.rows).toHaveLength(4)
    expect(existing.value.rows[0]!.value.bearingCm).toBeGreaterThan(0)
    expect(typeof existing.value.ok).toBe('boolean')
  })

  test('建物が無い・木造以外は分かる言葉で拒否する', () => {
    expect(() => adaptJpBuilding({})).toThrow(/建物/)
    expect(() => adaptJpBuilding(woodTwoStoreyScene({ buildingJp: { structure: 'rc' } }))).toThrow(
      /木造/,
    )
  })
})

describe('jp フィールドのスキーマ（E-003: 旧シーンは無変更で読める）', () => {
  test('jp 無しの旧ノードが parse でき、jp 付きは往復する', () => {
    const legacyWall = AnyNodeSchema.parse({
      id: 'wall_x',
      type: 'wall',
      start: [0, 0],
      end: [3, 0],
    })
    expect((legacyWall as { jp?: unknown }).jp).toBeUndefined()
    const legacySite = AnyNodeSchema.parse({ id: 'site_x', type: 'site' })
    expect((legacySite as { jp?: unknown }).jp).toBeUndefined()

    const wall = AnyNodeSchema.parse({
      id: 'wall_y',
      type: 'wall',
      start: [0, 0],
      end: [3, 0],
      jp: { bearing: { kinds: ['brace-45x90', 'panel-gypsum'], faces: 'one' }, exterior: true },
    }) as AnyNode & { type: 'wall' }
    expect(wall.jp).toEqual({
      bearing: { kinds: ['brace-45x90', 'panel-gypsum'], faces: 'one' },
      exterior: true,
    })
    const building = AnyNodeSchema.parse({
      id: 'building_y',
      type: 'building',
      jp: { extWall: 'siding' },
    }) as AnyNode & {
      type: 'building'
    }
    expect(building.jp).toEqual({ structure: 'wood-conventional', extWall: 'siding' })
    const site = AnyNodeSchema.parse({
      id: 'site_y',
      type: 'site',
      jp: { zoning: 'R1-low', kenpeiPct: 50 },
    }) as AnyNode & {
      type: 'site'
    }
    expect(site.jp).toEqual({ zoning: 'R1-low', kenpeiPct: 50 })
    const zone = AnyNodeSchema.parse({
      id: 'zone_y',
      type: 'zone',
      name: 'WC',
      polygon: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      jp: { roomKind: 'toilet' },
    }) as AnyNode & {
      type: 'zone'
    }
    expect(zone.jp).toEqual({ roomKind: 'toilet' })
  })

  test('不正な倍率や未知の仕様は parse で弾く', () => {
    expect(() =>
      AnyNodeSchema.parse({
        id: 'wall_z',
        type: 'wall',
        start: [0, 0],
        end: [3, 0],
        jp: { bearing: { kinds: ['nope'] } },
      }),
    ).toThrow()
    expect(() =>
      AnyNodeSchema.parse({
        id: 'wall_z',
        type: 'wall',
        start: [0, 0],
        end: [3, 0],
        jp: { bearing: { kinds: ['custom'], ratioOverride: 9 } },
      }),
    ).toThrow()
  })
})
