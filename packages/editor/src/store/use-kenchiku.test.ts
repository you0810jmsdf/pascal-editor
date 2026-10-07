import { beforeEach, describe, expect, test } from 'bun:test'
import { type AnyNode, AnyNode as AnyNodeSchema } from '@pascal-app/core'
import useKenchiku from './use-kenchiku'

// 6m × 4m の平屋。外壁4枚（構造用合板）と窓1つ。屋根諸元は上書きで与える。
function scene(): Record<string, AnyNode> {
  const raws: Record<string, unknown>[] = [
    { id: 'site_1', type: 'site', parentId: null, children: ['building_1'] },
    {
      id: 'building_1',
      type: 'building',
      parentId: 'site_1',
      children: ['level_1'],
      jp: { roofKind: 'metal', extWall: 'siding', roofRiseOverride: 1.0, overhangOverride: 0.45, pitchSunOverride: 4 },
    },
    { id: 'level_1', type: 'level', parentId: 'building_1', level: 0, height: 2.8, children: ['wall_s', 'wall_e', 'wall_n', 'wall_w'] },
    { id: 'wall_s', type: 'wall', parentId: 'level_1', start: [0, 0], end: [6, 0], thickness: 0.12, children: ['window_s'], jp: { bearing: { kinds: ['panel-plywood'] } } },
    { id: 'wall_e', type: 'wall', parentId: 'level_1', start: [6, 0], end: [6, 4], thickness: 0.12, jp: { bearing: { kinds: ['panel-plywood'] } } },
    { id: 'wall_n', type: 'wall', parentId: 'level_1', start: [6, 4], end: [0, 4], thickness: 0.12, jp: { bearing: { kinds: ['panel-plywood'] } } },
    { id: 'wall_w', type: 'wall', parentId: 'level_1', start: [0, 4], end: [0, 0], thickness: 0.12, jp: { bearing: { kinds: ['panel-plywood'] } } },
    { id: 'window_s', type: 'window', parentId: 'wall_s', wallId: 'wall_s', position: [3, 1.45, 0], width: 1.65, height: 1.1 },
  ]
  return Object.fromEntries(raws.map((raw) => [raw.id as string, AnyNodeSchema.parse(raw) as AnyNode]))
}

describe('useKenchiku（建築法規パネルの状態）', () => {
  beforeEach(() => useKenchiku.getState().clear())

  test('計算すると結果とノード参照を持ち、ノードが変わると古いと分かる', () => {
    const nodes = scene()
    const results = useKenchiku.getState().compute(nodes)
    expect(results).not.toBeNull()
    expect(useKenchiku.getState().error).toBeNull()
    expect(useKenchiku.getState().computedFor).toBe(nodes)
    expect(results!.required.value.lw[0]).toBeGreaterThan(0)
    expect(results!.existing.value.rows).toHaveLength(2)
    const changed = { ...nodes }
    expect(useKenchiku.getState().computedFor === changed).toBe(false)
  })

  test('建物が無いシーンは結果を持たず、分かる言葉で理由を残す', () => {
    const results = useKenchiku.getState().compute({})
    expect(results).toBeNull()
    expect(useKenchiku.getState().error).toContain('建物')
  })

  test('図書の表紙情報と表示の切替を保持する', () => {
    useKenchiku.getState().setMeta({ buildingName: 'テスト邸' })
    useKenchiku.getState().setShowBearingOverlay(false)
    expect(useKenchiku.getState().meta.buildingName).toBe('テスト邸')
    expect(useKenchiku.getState().showBearingOverlay).toBe(false)
  })
})
