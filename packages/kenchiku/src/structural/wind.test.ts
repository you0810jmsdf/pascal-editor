import { expect, test } from 'bun:test'
import { building } from '../__fixtures__/building'
import { requiredWind, windWall } from '../index'

test('§11 wind hand calculations and coefficient boundaries', () => {
  expect(requiredWind(40).value).toBe(2000)
  expect(requiredWind(40, 75).value).toBe(3000)
  expect(requiredWind(0).value).toBe(0)
  for (const coefficient of [49.99, 75.01, Number.NaN])
    expect(() => requiredWind(40, coefficient)).toThrow(RangeError)
  expect(() => requiredWind(-1)).toThrow(RangeError)
})

test('provided facade areas and breakdowns override the approximation', () => {
  const b = building()
  const facades = b.storeys.map((s) => ({
    storey: s.index,
    area: 40,
    parts: [
      { label: '壁', area: 35 },
      { label: '屋根', area: 5 },
    ],
  }))
  b.facade = { x: facades, y: facades }
  const rows = windWall(b).value.rows
  expect(rows.map((r) => r.value.requiredCm)).toEqual([2000, 2000, 2000, 2000])
  expect(rows[0]!.value.facade.parts.map((part) => part.area)).toEqual([35, 5])
})

test('bbox approximation uses the perpendicular width and includes all storeys above the cut', () => {
  const rows = windWall(building()).value.rows
  expect(rows[0]!.value.facade.area).toBeCloseTo(6 * (6 - 1.35) + (7 * 0.5) / 2, 10)
  expect(rows[1]!.value.facade.area).toBeCloseTo(10 * (6 - 1.35) + (11 * 0.5) / 2, 10)
  expect(rows[2]!.value.facade.area).toBeCloseTo(6 * (3 - 1.35) + (7 * 0.5) / 2, 10)
})

test('roof silhouette replaces the triangular approximation', () => {
  const b = building()
  b.roof.silhouette = {
    x: [
      [0, 0],
      [7, 0],
      [7, 0.5],
      [0, 0.5],
    ],
    y: [
      [0, 0],
      [11, 0],
      [11, 0.5],
      [0, 0.5],
    ],
  }
  expect(windWall(b).value.rows[0]!.value.facade.parts.at(-1)!.area).toBe(3.5)
})
