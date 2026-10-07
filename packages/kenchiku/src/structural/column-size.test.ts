import { expect, test } from 'bun:test'
import { building } from '../__fixtures__/building'
import { columnMinSize, columnSizes } from '../index'

test('official column ratios and actual-size comparisons', () => {
  const b = building()
  b.storeys[0]!.columns = [
    { id: 'too-small', at: [0, 0], sizeMm: [104, 105] },
    { id: 'fits', at: [10, 0], sizeMm: [105, 105], through: true },
    { id: 'unknown', at: [10, 6] },
  ]
  const columns = columnSizes(b).value.storeys
  expect(columns.map((s) => s.value.exterior.value.ratio)).toEqual(['1/27.4', '1/34.4'])
  expect(columns[0]!.value.columns!.map((c) => c.exteriorOk)).toEqual([false, true, undefined])
  expect(columns[0]!.value.interior.value.de).toBeLessThan(columns[0]!.value.exterior.value.de)
})

test('buckling branches and the effective slenderness limit', () => {
  // w = a²·(Kd/3·Fc)/(Ae·1000)、Fc=30/11で Kd/3·Fc=1 とした手計算。
  const fc = 30 / 11
  expect(columnMinSize(0.5, 3000, fc).value.de).toBe(98)
  expect(columnMinSize(2, 3000, fc).value.de).toBe(137)
  expect(columnMinSize(32, 3000, fc).value.de).toBe(400)
  expect(columnMinSize(0, 3000, fc).value.de).toBe(70)
  for (const load of [0, 0.5, 2, 32])
    expect(columnMinSize(load, 3000, fc).value.slenderness).toBeLessThanOrEqual(150)
  expect(() => columnMinSize(1, 3000, 0)).toThrow(RangeError)
})
