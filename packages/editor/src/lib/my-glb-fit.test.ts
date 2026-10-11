import { describe, expect, test } from 'bun:test'
import { fitFromBounds, guessUnit } from './my-glb-fit'

describe('guessUnit', () => {
  test('境界の値', () => {
    expect(guessUnit(0.5)).toBe('m')
    expect(guessUnit(10)).toBe('m')
    expect(guessUnit(10.01)).toBe('cm')
    expect(guessUnit(500)).toBe('cm')
    expect(guessUnit(500.01)).toBe('mm')
  })
})

describe('fitFromBounds', () => {
  test('メートル単位: 中心が原点から外れたモデルは底面中心へ寄る', () => {
    const r = fitFromBounds([1, 0.5, 2], [2, 1.5, 4])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fit.unit).toBe('m')
    expect(r.fit.dimensions).toEqual([1, 1, 2])
    // 中心 x=1.5, z=3 を打ち消し、底面 y=0.5 を 0 に
    expect(r.fit.offset).toEqual([-1.5, -0.5, -3])
    expect(r.fit.scale).toEqual([1, 1, 1])
  })

  test('原点中心で底が y=0 のモデルは offset が 0', () => {
    const r = fitFromBounds([-0.5, 0, -0.25], [0.5, 0.8, 0.25])
    expect(r.ok && r.fit.offset).toEqual([0, 0, 0])
  })

  test('cm 単位（高さ 90 など）は 0.01 倍で提案され、寸法はメートルになる', () => {
    const r = fitFromBounds([-30, 0, -20], [30, 90, 20])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fit.unit).toBe('cm')
    expect(r.fit.scale).toEqual([0.01, 0.01, 0.01])
    expect(r.fit.dimensions).toEqual([0.6, 0.9, 0.4])
  })

  test('mm 単位は 0.001 倍', () => {
    const r = fitFromBounds([0, 0, 0], [1800, 750, 900])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fit.unit).toBe('mm')
    expect(r.fit.dimensions).toEqual([1.8, 0.75, 0.9])
  })

  test('利用者が単位を直した値が優先される', () => {
    const r = fitFromBounds([0, 0, 0], [60, 90, 40], 'm')
    expect(r.ok && r.fit.dimensions).toEqual([60, 90, 40])
  })

  test('空・非有限・平らな板は ok:false', () => {
    expect(fitFromBounds([0, 0, 0], [0, 0, 0])).toEqual({ ok: false, problem: 'empty' })
    expect(fitFromBounds([Number.POSITIVE_INFINITY, 0, 0], [1, 1, 1])).toEqual({
      ok: false,
      problem: 'not-finite',
    })
    expect(fitFromBounds([0, 0, 0], [1, 0, 1])).toEqual({ ok: false, problem: 'flat' })
  })
})
