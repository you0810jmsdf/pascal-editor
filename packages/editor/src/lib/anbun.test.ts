import { describe, expect, test } from 'bun:test'
import { anbunCsv, computeAnbun, formatRatio } from './anbun'

const room = (
  name: string,
  area: number,
  over: Partial<{
    use: 'business' | 'private' | 'shared'
    share: number
    count: boolean
    level: string
  }> = {},
) => ({ id: `zone_${name}`, name, level: over.level ?? '1階', area, ...over })

describe('computeAnbun', () => {
  test('事業用 ÷ 総面積。未設定は私用扱いで数える', () => {
    const r = computeAnbun([
      room('アトリエ', 20, { use: 'business' }),
      room('寝室', 20, { use: 'private' }),
      room('廊下', 10),
    ])
    expect(r.totalArea).toBeCloseTo(50, 6)
    expect(r.businessArea).toBeCloseTo(20, 6)
    expect(r.ratio).toBeCloseTo(0.4, 6)
    expect(r.unsetCount).toBe(1)
    expect(r.rows[2]).toMatchObject({ use: 'private', share: 0, count: true, businessArea: 0 })
  })

  test('共用は面積×共用割合だけ事業分に入る。割合は 0〜1 に丸める', () => {
    const r = computeAnbun([
      room('事務', 10, { use: 'business' }),
      room('玄関', 10, { use: 'shared', share: 0.5 }),
      room('台所', 10, { use: 'shared', share: 1.7 }),
      room('居間', 10, { use: 'shared' }),
    ])
    expect(r.totalArea).toBe(40)
    expect(r.businessArea).toBeCloseTo(10 + 5 + 10 + 0, 6)
    expect(r.rows[2]!.share).toBe(1)
    expect(r.rows[3]!.share).toBe(0)
  })

  test('「数えない」部屋は総面積にも事業分にも入らない', () => {
    const r = computeAnbun([
      room('アトリエ', 30, { use: 'business' }),
      room('バルコニー', 10, { use: 'business', count: false }),
      room('寝室', 20, { use: 'private' }),
    ])
    expect(r.totalArea).toBe(50)
    expect(r.businessArea).toBe(30)
    expect(r.ratio).toBeCloseTo(0.6, 6)
    expect(r.rows[1]!.businessArea).toBe(0)
  })

  test('面積が無い・負・非有限は 0 として扱い、総面積 0 なら率は null', () => {
    expect(computeAnbun([]).ratio).toBeNull()
    const r = computeAnbun([room('x', -5, { use: 'business' }), room('y', Number.NaN)])
    expect(r.totalArea).toBe(0)
    expect(r.ratio).toBeNull()
  })

  test('2階すべて事業用の例（図面の壁芯面積）: 62.89 / 141.07 = 44.58%', () => {
    const r = computeAnbun([
      room('1階', 78.18, { use: 'private', level: '1階' }),
      room('2階', 62.89, { use: 'business', level: '2階' }),
    ])
    expect(formatRatio(r.ratio)).toBe('44.58%')
  })
})

describe('formatRatio / anbunCsv', () => {
  test('% は小数2桁、null は —', () => {
    expect(formatRatio(0.5696)).toBe('56.96%')
    expect(formatRatio(null)).toBe('—')
  })

  test('CSV は BOM 付き・見出し行・合計・計算式を含み、ダブルクォートを二重にする', () => {
    const r = computeAnbun([room('作業"室', 12.345, { use: 'business' }), room('寝室', 10)])
    const csv = anbunCsv(r, { title: '按分の根拠', date: '2026-10-12', note: '内法で計測' })
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('"階","部屋","面積(㎡)","区分","共用割合","総面積に数える","事業分(㎡)"')
    expect(csv).toContain('"作業""室"')
    expect(csv).toContain('"12.35"')
    expect(csv).toContain('"按分率","55.25%"')
    expect(csv).toContain('計算式')
    expect(csv).toContain('内法で計測')
  })
})
