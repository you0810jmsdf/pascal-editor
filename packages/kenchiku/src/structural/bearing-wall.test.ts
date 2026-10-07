import { expect, test } from 'bun:test'
import { building } from '../__fixtures__/building'
import { bearingRatio, bearingWalls, type JpWall, wallSegments } from '../index'

const wall = (patch: Partial<JpWall> = {}): JpWall => ({
  id: 'wall',
  start: [0, 0],
  end: [10, 0],
  height: 3,
  thickness: 0.1,
  openings: [],
  bearing: { kind: 'panel-plywood' },
  ...patch,
})

test('§11 10m壁と1.8m開口は4.1mの2区間・2050cm', () => {
  const w = wall({ openings: [{ u: 5, width: 1.8, bottom: 1, height: 1, kind: 'window' }] })
  const result = wallSegments(w, 0.9, 3).value
  expect(result.segments.map((s) => s.value.length)).toEqual([4.1, 4.1])
  expect(result.segments.reduce((sum, s) => sum + s.value.wallCm, 0)).toBeCloseTo(2050, 9)
  expect(result.openingLength).toBeCloseTo(1.8)
  expect(result.effectiveLength).toBeCloseTo(8.2)
  expect(wallSegments(wall({ end: [0.8, 0] }), 0.9, 3).value.segments).toHaveLength(0)
  expect(wallSegments(wall({ end: [0.9, 0] }), 0.9, 3).value.segments).toHaveLength(1)
})

test('開口の重複・壁外部分を二重控除しない', () => {
  const w = wall({
    openings: [-1, 0, 1, 2, 3, 11].map((u) => ({
      u,
      width: 2,
      bottom: 0,
      height: 2,
      kind: 'door',
    })),
  })
  const result = wallSegments(w, 0.9, 3).value
  expect(result.openingLength).toBe(4)
  expect(result.segments[0]!.value.start).toEqual([4, 0])
  expect(result.segments[0]!.value.wallCm).toBe(1500)
})

test('±22.5°の境界・逆向き・斜め・曲面を区別する', () => {
  const make = (angle: number) => wall({ end: [10 * Math.cos(angle), 10 * Math.sin(angle)] })
  for (const angle of [Math.PI / 8, -Math.PI / 8, Math.PI + Math.PI / 8])
    expect(wallSegments(make(angle), 0.9, 3).value.direction).toBe('x')
  expect(wallSegments(make(Math.PI / 2), 0.9, 3).value.direction).toBe('y')
  const b = building()
  b.storeys[0]!.walls = [make(Math.PI / 8 + 0.001), wall({ curveOffset: 1 })]
  const result = bearingWalls(b).value.storeys[0]!.value
  expect(result.excluded).toEqual({ curved: 1, diagonal: 1, unsupportedQuasi: 0 })
  expect(result.segments).toHaveLength(0)
})

test('§11 併用上限7・90角たすき上限5・筋かいのみαh低減', () => {
  expect(
    bearingRatio(
      { kind: 'combined', components: [{ kind: 'brace-45x90-x' }, { kind: 'brace-45x90-x' }] },
      1,
      3,
    ).value.ratio,
  ).toBe(7)
  expect(
    bearingRatio(
      { kind: 'combined', components: [{ kind: 'brace-90x90-x' }, { kind: 'brace-45x90' }] },
      1,
      3,
    ).value.ratio,
  ).toBe(5)
  expect(bearingRatio({ kind: 'brace-45x90' }, 0.9, 3.2).value.ratio).toBe(2)
  expect(
    bearingRatio(
      { kind: 'combined', components: [{ kind: 'brace-45x90' }, { kind: 'panel-plywood' }] },
      0.9,
      3.5,
    ).value.ratio,
  ).toBeCloseTo(4.3)
  expect(bearingRatio({ kind: 'brace-45x90', braceLengthMm: 1000 }, 0.9, 3.5).value.ratio).toBe(2)
  expect(() => bearingRatio({ kind: 'custom' }, 1, 3)).toThrow(RangeError)
  expect(() => bearingRatio({ kind: 'combined' }, 1, 3)).toThrow(RangeError)
})

test('準耐力壁は明示有効時のみ、片面上限・両面・高さ比を適用', () => {
  expect(bearingRatio({ kind: 'panel-plywood', faces: 'both' }, 1, 3).value.ratio).toBe(5)
  const w = wall({
    bearing: {
      kind: 'custom',
      ratioOverride: 7,
      faces: 'both',
      quasi: { kind: 'panel', panelHeightRatio: 1 },
    },
  })
  expect(wallSegments(w, 0.9, 3, false).value.segments).toHaveLength(0)
  expect(wallSegments(w, 0.9, 3, true).value.segments[0]!.value.ratio).toBe(3)
  w.bearing = { kind: 'lath-one', quasi: { kind: 'lath', panelHeightRatio: 0.5 } }
  expect(wallSegments(w, 0.9, 3, true).value.segments[0]!.value.ratio).toBe(0.25)
})

test('垂れ壁・腰壁は幅・高さ・両側の耐力壁を確認する', () => {
  const b = building()
  b.quasiWalls = true
  const middle = wall({
    id: 'quasi',
    start: [1, 0],
    end: [2, 0],
    bearing: {
      kind: 'panel-plywood',
      quasi: { kind: 'panel', panelHeightRatio: 0.12, clearHeight: 3, position: 'hanging' },
    },
  })
  b.storeys[0]!.walls = [
    wall({ id: 'left', end: [1, 0] }),
    middle,
    wall({ id: 'right', start: [2, 0], end: [3, 0] }),
  ]
  expect(
    bearingWalls(b).value.storeys[0]!.value.segments.filter((s) => s.value.quasi),
  ).toHaveLength(1)
  b.storeys[0]!.walls.pop()
  expect(bearingWalls(b).value.storeys[0]!.value.excluded.unsupportedQuasi).toBe(1)
  middle.end = [3.01, 0]
  expect(wallSegments(middle, 0.9, 3, true).value.segments).toHaveLength(0)
})
