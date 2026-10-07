import { expect, test } from 'bun:test'
import { building } from '../__fixtures__/building'
import { existingWall, wallSufficiency } from '../index'

test('準耐力壁を必要壁量の半分で制限し、地震と風の大きい方で判定', () => {
  const result = wallSufficiency(999, 2000, 1500, 2000)
  expect(result.value.countedQuasiCm).toBe(1000)
  expect(result.value.excludedQuasiCm).toBe(1000)
  expect(result.value.ratio).toBe(0.9995)
  expect(result.value.ok).toBe(false)
  expect(result.explain.notes?.length).toBeGreaterThan(0)
  expect(wallSufficiency(1000, 2000, 2000, 1500).value.ok).toBe(true)
  expect(wallSufficiency(0, 0, 0, 0).value.ratio).toBeNull()
})

test('総合判定は全階・両方向を必要とし、入力を変更しない', () => {
  const b = building()
  for (const s of b.storeys)
    s.walls = ['x', 'y'].map((d, i) => ({
      id: `${s.index}-${d}`,
      start: [0, 0],
      end: i ? [0, 10] : [10, 0],
      height: 3,
      thickness: 0.1,
      openings: [],
      bearing: { kind: 'custom', ratioOverride: 7 },
    }))
  const before = structuredClone(b)
  expect(existingWall(b).value.ok).toBe(true)
  expect(b).toEqual(before)
  b.storeys[1]!.walls.pop()
  const result = existingWall(b)
  expect(result.value.rows).toHaveLength(4)
  expect(result.value.ok).toBe(false)
  expect(
    result.value.rows.filter((r) => !r.value.ok).map((r) => [r.value.storey, r.value.direction]),
  ).toEqual([[2, 'y']])
})
