import { expect, test } from 'bun:test'
import { building } from '../__fixtures__/building'
import { type BearingSegment, quarterBalance, quarterMethod, quarterStorey } from '../index'

function segment(y: number, wallCm: number, quasi = false): BearingSegment {
  return {
    wallId: `wall-${y}`,
    direction: 'x',
    start: [0, y],
    end: [1, y],
    length: 1,
    ratio: wallCm / 100,
    wallCm,
    quasi,
    spec: { kind: 'custom', ratioOverride: wallCm / 100 },
  }
}

test('§11 指定面積16㎡なら480cm・充足率0.625/1.25・壁率比0.5', () => {
  // TODO(spec §11): 10m×8mの四分割帯は20㎡。本文の16㎡という手計算条件とは一致しない。
  const result = quarterBalance(16, 16, 300, 600, 30).value
  expect(result.required).toEqual([480, 480])
  expect(result.ratios).toEqual([0.625, 1.25])
  expect(result.wallRatio).toBe(0.5)
  expect(result.ok).toBe(true)
  expect(quarterBalance(16, 16, 299, 600, 30).value.ok).toBe(false)
  expect(quarterBalance(16, 16, 480, 1500, 30).value.ok).toBe(true)
  expect(quarterBalance(16, 16, 0, 0, 30).value.ok).toBe(false)
})

test('10m×8mの帯幅は2m、面積20㎡。中点で算入し準耐力壁を除外', () => {
  const s = building().storeys[0]!
  s.floorPolygon = [
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ]
  const result = quarterStorey(s, 'x', 30, [
    segment(1, 300),
    segment(7, 600),
    segment(4, 1000),
    segment(1, 500, true),
  ]).value
  expect(result.bands.map((b) => b.area)).toEqual([20, 20])
  expect(result.required).toEqual([600, 600])
  expect(result.ratios).toEqual([0.5, 1])
  expect(result.wallRatio).toBe(0.5)
  expect(result.ok).toBe(true)
  expect(quarterStorey(s, 'y', 30, []).value.bands.map((b) => b.area)).toEqual([20, 20])
})

test('凹形が帯内で分離しても実面積を求め、穴を控除し頂点順に依存しない', () => {
  const s = building().storeys[0]!
  s.floorPolygon = [
    [0, 0],
    [8, 0],
    [8, 8],
    [6, 8],
    [6, 2],
    [2, 2],
    [2, 8],
    [0, 8],
  ]
  s.holes = [
    [
      [0.5, 6],
      [1.5, 6],
      [1.5, 7],
      [0.5, 7],
    ],
  ]
  const result = quarterStorey(s, 'x', 30, []).value
  expect(result.bands.map((b) => b.area)).toEqual([16, 7])
  s.floorPolygon.reverse()
  s.holes[0]!.reverse()
  expect(quarterStorey(s, 'x', 30, []).value.bands.map((b) => b.area)).toEqual([16, 7])
})

test('全階各方向の四分割結果を建物入力から生成する', () => {
  const result = quarterMethod(building()).value
  expect(result.rows).toHaveLength(4)
  expect(result.ok).toBe(false)
})
