import { describe, expect, test } from 'bun:test'
import { building } from '../__fixtures__/building'
import vectors from '../__fixtures__/kenchiku_vectors.json'
import {
  columnSizes,
  type Explain,
  type JpBuildingInput,
  KenchikuScopeError,
  requiredWall,
  windWall,
} from '../index'

interface Vector {
  input: {
    h1: number
    h2?: number
    roof_rise: number
    c0: number
    af1?: number
    af2?: number
    overhang: number
    pitch_sun: number
    roof: string
    ext: string
    pv?: string
  }
  lw: number[]
  columns?: number[]
  column?: number
  A2?: number
  w1: number
  w2?: number
}

function fromVector(vector: Vector): JpBuildingInput {
  const b = building()
  const v = vector.input
  b.storeys[0]!.height = v.h1
  // 平屋fixtureには面積が無い。Lwと柱小径は面積に依存しないため60㎡の試験建物を使用。
  b.storeys[0]!.floorArea = v.af1 ?? 60
  if (v.h2 !== undefined) {
    b.storeys[1]!.height = v.h2
    b.storeys[1]!.floorArea = v.af2!
  } else b.storeys = [b.storeys[0]!]
  b.roof = {
    kind: v.roof as JpBuildingInput['roof']['kind'],
    rise: v.roof_rise,
    overhang: v.overhang,
    pitchSun: v.pitch_sun,
  }
  b.c0 = v.c0 as JpBuildingInput['c0']
  b.extWall = v.ext as JpBuildingInput['extWall']
  b.pv = { kind: (v.pv ?? 'none') as JpBuildingInput['pv']['kind'] }
  return b
}

function expectExplain(explain: Explain): void {
  expect(explain.formula.length).toBeGreaterThan(0)
  expect(explain.substituted.length).toBeGreaterThan(0)
  expect(explain.references.length).toBeGreaterThan(0)
  for (const ref of explain.references) {
    expect(new URL(ref.url).protocol).toBe('https:')
    expect(ref.law.length).toBeGreaterThan(0)
    expect(ref.article.length).toBeGreaterThan(0)
  }
  for (const step of explain.steps ?? []) expectExplain(step)
}

describe('kenchiku oracle vectors', () => {
  for (const [name, vector] of Object.entries(vectors) as [string, Vector][]) {
    test(name, () => {
      const input = fromVector(vector)
      const result = requiredWall(input)
      const columns = columnSizes(input)
      expect(result.value.lw).toEqual(vector.lw)
      expect(Number(result.value.w1.toFixed(4))).toBe(vector.w1)
      if (vector.w2 !== undefined) expect(Number(result.value.w2!.toFixed(4))).toBe(vector.w2)
      if (vector.A2 !== undefined) expect(Number(result.value.a2!.toFixed(4))).toBe(vector.A2)
      expect(columns.value.storeys.map((s) => s.value.exterior.value.de)).toEqual(
        vector.columns ?? [vector.column!],
      )
      expect(result.value.requiredCm).toEqual(
        vector.lw.map((l, i) => l * input.storeys[i]!.floorArea),
      )
      expectExplain(result.explain)
      expectExplain(columns.explain)
    })
  }
})

test('snow affects only reference grades and custom PV matches the specified load', () => {
  const input = building()
  const original = requiredWall(input)
  input.pv = { kind: 'custom', loadNPerM2: 200 }
  expect(requiredWall(input).value).toEqual(original.value)
  input.snow = { depthCm: 100, unitNPerM2PerCm: 20 }
  const snowy = requiredWall(input).value
  expect(snowy.lw).toEqual(original.value.lw)
  expect(snowy.referenceGrades.grade2.value.lw[0]).toBeGreaterThan(
    original.value.referenceGrades.grade2.value.lw[0]!,
  )
  expect(snowy.referenceGrades.grade3.value.lw[0]).toBeGreaterThan(
    snowy.referenceGrades.grade2.value.lw[0]!,
  )
})

test('office live loads increase first-storey loads but leave roof-storey loads unchanged', () => {
  const input = building()
  const house = requiredWall(input).value
  input.use = 'office'
  const office = requiredWall(input).value
  expect(office.w1 - house.w1).toBeCloseTo(0.2, 10)
  expect(office.w2).toBe(house.w2)
})

test('scope boundaries are enforced by every building calculation', () => {
  for (const calculate of [requiredWall, columnSizes, windWall]) {
    const b = building()
    b.storeys.forEach((s) => {
      s.floorArea = 150
    })
    b.storeys[0]!.height = 7.5
    b.storeys[1]!.height = 7.5
    expect(() => calculate(b)).not.toThrow()
    b.storeys[0]!.floorArea += 0.001
    expect(() => calculate(b)).toThrow(KenchikuScopeError)
    b.storeys[0]!.floorArea = 150
    b.roof.rise += 0.001
    expect(() => calculate(b)).toThrow(KenchikuScopeError)
    const three = building()
    three.storeys.push({ ...three.storeys[0]!, index: 3 })
    expect(() => calculate(three)).toThrow(KenchikuScopeError)
  }
})

test('invalid area, height, and unspecified custom PV cannot produce numeric results', () => {
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const b = building()
    b.storeys[0]!.floorArea = bad
    expect(() => requiredWall(b)).toThrow(RangeError)
  }
  const b = building()
  b.pv = { kind: 'custom' }
  expect(() => requiredWall(b)).toThrow(RangeError)
  b.pv = { kind: 'none' }
  b.storeys[0]!.height = 0.12
  expect(() => columnSizes(b)).toThrow(KenchikuScopeError)
})
