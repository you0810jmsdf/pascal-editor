import { describe, expect, test } from 'bun:test'
import { building } from '../__fixtures__/building'
import type { JpBuildingInput, JpWall } from '../model'
import { beamGuide, centroid, eccentricity, foundationGuide, referenceChecks } from './reference'

function wall(
  id: string,
  start: [number, number],
  end: [number, number],
  exterior = true,
  kind: JpWall['bearing'] = { kind: 'panel-plywood' },
): JpWall {
  return { id, start, end, thickness: 0.12, height: 3, exterior, openings: [], bearing: kind }
}

/** 10m × 6m の平屋。外周4枚が耐力壁（倍率2.5）。 */
function symmetric(): JpBuildingInput {
  const b = building()
  b.storeys = [b.storeys[0]!]
  b.storeys[0]!.walls = [
    wall('s', [0, 0], [10, 0]),
    wall('e', [10, 0], [10, 6]),
    wall('n', [10, 6], [0, 6]),
    wall('w', [0, 6], [0, 0]),
  ]
  b.storeys[0]!.rooms = [
    {
      id: 'r1',
      name: '居間',
      polygon: [
        [0.06, 0.06],
        [4.94, 0.06],
        [4.94, 5.94],
        [0.06, 5.94],
      ],
      area: 28.7,
      kind: 'living',
      ceilingHeight: 2.4,
      windows: [],
    },
  ]
  return b
}

describe('参考機能（偏心率・横架材・基礎）', () => {
  test('図心は矩形の中心', () => {
    const [x, y] = centroid([
      [0, 0],
      [10, 0],
      [10, 6],
      [0, 6],
    ])
    expect(x).toBeCloseTo(5, 9)
    expect(y).toBeCloseTo(3, 9)
  })

  test('対称な配置では偏心率 0 で適合、南の壁を外すと Y 壁の剛心がずれて偏心率が増える', () => {
    const b = symmetric()
    const sym = eccentricity(b).value.rows[0]!.value
    expect(sym.computable).toBe(true)
    if (sym.computable) {
      expect(sym.Rex).toBeCloseTo(0, 6)
      expect(sym.Rey).toBeCloseTo(0, 6)
      expect(sym.ok).toBe(true)
    }
    // 北の壁を非耐力にすると X 壁は南だけ → 剛心 y=0、重心 y=3 → 偏心
    b.storeys[0]!.walls[2]!.bearing = undefined
    const skew = eccentricity(b).value.rows[0]!.value
    expect(skew.computable).toBe(true)
    if (skew.computable) {
      expect(skew.ey).toBeCloseTo(3, 6)
      expect(skew.Rex).toBeGreaterThan(0.3)
      expect(skew.ok).toBe(false)
    }
  })

  test('片方向の耐力壁が無い階は算定不可', () => {
    const b = symmetric()
    b.storeys[0]!.walls[1]!.bearing = undefined
    b.storeys[0]!.walls[3]!.bearing = undefined
    expect(eccentricity(b).value.rows[0]!.value.computable).toBe(false)
    expect(eccentricity(b).value.ok).toBe(false)
  })

  test('横架材：短辺 4.88m+0.12 = 5.0m の部屋は平屋なので小屋梁 300mm', () => {
    const rows = beamGuide(symmetric()).value.rows
    expect(rows).toHaveLength(1)
    expect(rows[0]!.member).toBe('小屋梁')
    expect(rows[0]!.span).toBeCloseTo(5.0, 6)
    expect(rows[0]!.depthMm).toBe(300)
    const b = symmetric()
    b.storeys[0]!.rooms![0]!.polygon = [
      [0, 0],
      [6, 0],
      [6, 6],
      [0, 6],
    ]
    expect(beamGuide(b).value.rows[0]!.depthMm).toBeNull()
  })

  test('基礎：60㎡・スレートで W=300kN、外周 32m × 0.45 → q布 20.8、qべた 5.0。地耐力未入力は 30 を仮定', () => {
    const f = foundationGuide(symmetric()).value
    expect(f.weightKn).toBeCloseTo(300, 6)
    expect(f.qStrip).toBeCloseTo(300 / (32 * 0.45), 6)
    expect(f.qMat).toBeCloseTo(5, 6)
    expect(f.soilAssumed).toBe(true)
    expect(f.okStrip).toBe(true)
    const b = symmetric()
    b.foundation = { soilBearingKnM2: 15 }
    expect(foundationGuide(b).value.recommendation).toContain('20kN/㎡ 未満')
    b.foundation = { soilBearingKnM2: 25 }
    expect(foundationGuide(b).value.recommendation).toContain('べた基礎または杭基礎')
  })

  test('一式は3つの参考結果を返し explain を持つ', () => {
    const r = referenceChecks(symmetric())
    expect(r.value.eccentricity.value.rows).toHaveLength(1)
    expect(r.value.beams.value.rows).toHaveLength(1)
    expect(r.value.foundation.value.recommendation.length).toBeGreaterThan(0)
    expect(r.explain.steps).toHaveLength(3)
  })
})
