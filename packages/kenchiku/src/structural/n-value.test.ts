import { expect, test } from 'bun:test'
import { building } from '../__fixtures__/building'
import { type JpWall, nValue, nValues } from '../index'

const wall = (id: string, start: [number, number], end: [number, number], ratio = 2.5): JpWall => ({
  id,
  start,
  end,
  height: 3,
  thickness: 0.1,
  openings: [],
  bearing: { kind: 'custom', ratioOverride: ratio },
})

test('§11 一般柱A1=A2=2.5はN0.9・は、最上階出隅A1=5はN3.6・ち', () => {
  expect(nValue(2.5, 2.5, false, true).value.n).toBeCloseTo(0.9)
  expect(nValue(2.5, 2.5, false, true).value.hardware.symbol).toBe('は')
  expect(nValue(5, 0, true, false).value.n).toBe(3.6)
  expect(nValue(5, 0, true, false).value.hardware.symbol).toBe('ち')
})

test('金物の全境界と5.6超・ぬは15kN×2＝30kN', () => {
  for (const [n, symbol] of [
    [0, 'い'],
    [0.65, 'ろ'],
    [1, 'は'],
    [1.4, 'に'],
    [1.6, 'ほ'],
    [1.8, 'へ'],
    [2.8, 'と'],
    [3.7, 'ち'],
    [4.7, 'り'],
    [5.6, 'ぬ'],
  ] as const) {
    expect(nValue((n + 0.6) / 0.5, 0, false, false).value.hardware.symbol).toBe(symbol)
  }
  expect(nValue(12.5, 0, false, false).value.individualCalculation).toBe(true)
  expect(nValue(12.4, 0, false, false).value.hardware.requiredKn).toBe(30)
})

test('柱ノード優先、同方向の両側差と上階の同位置柱を用いる', () => {
  const b = building()
  b.storeys[0]!.columns = [{ id: 'lower', at: [3, 3] }]
  b.storeys[1]!.columns = [{ id: 'upper', at: [3.3, 3] }]
  b.storeys[0]!.walls = [wall('right', [3, 3], [5, 3], 5), wall('left', [1, 3], [3, 3], 2.5)]
  b.storeys[1]!.walls = [wall('up', [3.3, 3], [5, 3])]
  const result = nValues(b).value.rows
  expect(result).toHaveLength(2)
  expect(result[0]!.value.upperColumnId).toBe('upper')
  expect(result[0]!.value.governing.a1).toBe(2.5)
  expect(result[0]!.value.governing.a2).toBe(2.5)
  expect(result[0]!.value.governing.n).toBeCloseTo(0.9)
  b.storeys[1]!.columns[0]!.at = [3.301, 3]
  expect(nValues(b).value.rows[0]!.value.governing.a2).toBe(0)
})

test('上下階の出隅は独立判定し、X/YのNを比較する', () => {
  const b = building()
  b.storeys[0]!.columns = [{ id: 'lower', at: [3, 3] }]
  b.storeys[1]!.columns = [{ id: 'upper', at: [3, 3] }]
  b.storeys[1]!.floorPolygon = [
    [3, 3],
    [10, 3],
    [10, 6],
    [3, 6],
  ]
  b.storeys[0]!.walls = [wall('x', [3, 3], [5, 3]), wall('y', [3, 3], [3, 5], 3)]
  b.storeys[1]!.walls = [wall('x', [3, 3], [5, 3], 5)]
  const row = nValues(b).value.rows[0]!.value
  expect(row.corner).toBe(false)
  expect(row.upperCorner).toBe(true)
  expect(row.governing.direction).toBe('x')
  expect(row.governing.b2).toBe(0.8)
  expect(row.governing.n).toBeCloseTo(3.65)
})

test('凸頂点のみ出隅、端点柱を0.15mで併合し頂点順に依存しない', () => {
  const b = building()
  b.storeys = [b.storeys[0]!]
  const s = b.storeys[0]!
  s.floorPolygon = [
    [0, 0],
    [6, 0],
    [6, 2],
    [2, 2],
    [2, 6],
    [0, 6],
  ]
  s.walls = [
    wall('one', [0, 0], [2, 0]),
    wall('two', [2.15, 0], [4, 0]),
    wall('inner', [2, 2], [4, 2]),
  ]
  const result = nValues(b).value.rows
  expect(result).toHaveLength(5)
  expect(result.find((r) => r.value.column.at[0] === 0)!.value.corner).toBe(true)
  expect(result.find((r) => r.value.column.at[1] === 2)!.value.corner).toBe(false)
  s.floorPolygon.reverse()
  s.floorPolygon.push([...s.floorPolygon[0]!])
  expect(nValues(b).value.rows.map((r) => r.value.corner)).toEqual(
    result.map((r) => r.value.corner),
  )
})

test('筋かい補正は向き・たすき掛けを区別し、Ho>3.2を注記', () => {
  const b = building()
  b.storeys = [b.storeys[0]!]
  const s = b.storeys[0]!
  s.columns = [
    { id: 'start', at: [3, 3] },
    { id: 'end', at: [5, 3] },
  ]
  const w = wall('brace', [3, 3], [5, 3])
  w.bearing = { kind: 'brace-90x90', braceTop: 'start' }
  s.walls = [w]
  s.horizontalMemberDistance = 3.3
  const rows = nValues(b).value.rows
  expect(rows.map((r) => r.value.governing.a1)).toEqual([5, 1])
  expect(rows[0]!.explain.notes?.length).toBeGreaterThan(0)
  w.bearing.braceTop = undefined
  expect(nValues(b).value.rows.map((r) => r.value.governing.a1)).toEqual([5, 5])
  w.bearing.kind = 'brace-90x90-x'
  expect(nValues(b).value.rows.map((r) => r.value.governing.a1)).toEqual([5, 5])
})
