import { describe, expect, test } from 'bun:test'
import { building } from '../__fixtures__/building'
import type { JpBuildingInput, JpWall } from '../model'
import { buildAllDocuments, buildDocument, collectKenchikuResults, DOCUMENTS } from './index'

/** 10m × 6m の2階建て。外壁4枚（構造用合板 2.5）＋間仕切1枚、各外壁に窓1、南に戸1。 */
function house(): JpBuildingInput {
  const b = building()
  const wall = (
    id: string,
    start: [number, number],
    end: [number, number],
    openings: JpWall['openings'] = [],
  ): JpWall => ({
    id,
    start,
    end,
    thickness: 0.12,
    height: 2.9,
    exterior: true,
    openings,
    bearing: { kind: 'panel-plywood' },
  })
  for (const s of b.storeys) {
    s.walls = [
      wall(
        `wall_${s.index}s`,
        [0, 0],
        [10, 0],
        [
          { u: 1.2, width: 0.8, bottom: 0, height: 2, kind: 'door' },
          { u: 6, width: 1.65, bottom: 0.9, height: 1.1, kind: 'window' },
        ],
      ),
      wall(
        `wall_${s.index}e`,
        [10, 0],
        [10, 6],
        [{ u: 3, width: 1.65, bottom: 0.9, height: 1.1, kind: 'window' }],
      ),
      wall(
        `wall_${s.index}n`,
        [10, 6],
        [0, 6],
        [{ u: 4, width: 1.65, bottom: 0.9, height: 1.1, kind: 'window' }],
      ),
      wall(
        `wall_${s.index}w`,
        [0, 6],
        [0, 0],
        [{ u: 3, width: 1.65, bottom: 0.9, height: 1.1, kind: 'window' }],
      ),
      {
        ...wall(`wall_${s.index}i`, [5, 0], [5, 6]),
        exterior: false,
        bearing: { kind: 'brace-45x90' },
      },
    ]
    s.rooms = [
      {
        id: `zone_${s.index}`,
        name: s.index === 1 ? 'LDK' : '寝室',
        polygon: [
          [0.06, 0.06],
          [4.94, 0.06],
          [4.94, 5.94],
          [0.06, 5.94],
        ],
        area: 28.7,
        kind: 'living',
        ceilingHeight: 2.4,
        windows: [{ u: 3, width: 1.65, bottom: 0.9, height: 1.1, kind: 'window' }],
        daylightNeighborDistance: 3,
      },
    ]
    s.columns = [
      { id: `column_${s.index}a`, at: [0, 0], sizeMm: [105, 105], through: s.index === 1 },
    ]
  }
  b.storeys[0]!.stairs = [{ id: 'stair_1', riser: 0.2, tread: 0.22, width: 0.8 }]
  b.site = {
    polygon: [
      [-2, -2],
      [13, -2],
      [13, 18],
      [-2, 18],
    ],
    northRotation: 0,
    zoning: 'R1-low',
    kenpeiPct: 50,
    yosekiPct: 100,
    roads: [{ edgeIndex: 0, width: 4, type: 'art42-1' }],
    absoluteHeightLimit: 10,
    wallSetback: 1,
    fireZone: 'quasi',
    energyRegion: 6,
    authority: '印西市 都市建設部 開発建築課 建築指導係',
  }
  return b
}

const META = {
  buildingName: 'テスト邸',
  address: '千葉県印西市（テスト）',
  designer: '（記名欄）',
  date: '2026-10-07',
}

describe('図書 D1〜D9（仕様書 §8）', () => {
  const results = collectKenchikuResults(house())

  test('9 図書すべてが HTML として生成され、免責・基準日・建物名を含む', () => {
    for (const d of DOCUMENTS) {
      const html = buildDocument(d.id, results, META)
      expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
      expect(html).toContain('<html lang="ja">')
      expect(html).toContain('参考資料')
      expect(html).toContain('2025-04-01')
      expect(html).toContain('テスト邸')
      expect(html).toContain('2026-10-07')
      expect(html).toContain(d.title)
      expect(html).not.toContain('document.write')
      expect(html).not.toContain('undefined')
      expect(html).not.toContain('NaN')
    }
  })

  test('D1 壁量計算書に必要壁量・存在壁量・判定と Lw の数値がある', () => {
    const html = buildDocument('D1', results, META)
    for (const key of [
      '必要壁量',
      '存在壁量',
      '判定',
      '見付面積',
      '床面積に乗ずる数値',
      '充足率',
      '適合',
    ])
      expect(html).toContain(key)
    const lw = results.required.value.lw
    expect(html).toContain(`${lw[0]}`)
    expect(html).toContain('条文を開く')
  })

  test('D2 四分割法に壁率比と側端部分の図、D3 N値に金物記号、D4 に必要小径、D5 に配置図', () => {
    expect(buildDocument('D2', results, META)).toContain('壁率比')
    expect(buildDocument('D2', results, META)).toContain('<svg')
    const d3 = buildDocument('D3', results, META)
    expect(d3).toContain('金物')
    expect(d3).toMatch(/[いろはにほへとちりぬ]）/)
    const d4 = buildDocument('D4', results, META)
    expect(d4).toContain('必要小径')
    expect(d4).toContain(`${results.columns.value.storeys[0]!.value.exterior.value.de}`)
    const d5 = buildDocument('D5', results, META)
    expect(d5).toContain('耐力壁配置図')
    expect(d5.match(/<svg/g)?.length).toBe(2)
  })

  test('D6 に延べ面積と座標法の表、D7 に法規チェックの集計、D8 に図書一覧、D9 に仕様表', () => {
    const d6 = buildDocument('D6', results, META)
    expect(d6).toContain('延べ面積')
    expect(d6).toContain('120.00')
    const d7 = buildDocument('D7', results, META)
    expect(d7).toContain('接道義務')
    expect(d7).toContain('採光')
    expect(d7).toContain('laws.e-gov.go.jp')
    const d8 = buildDocument('D8', results, META)
    expect(d8).toContain('壁量計算書')
    expect(d8).toContain('新2号')
    expect(d8).toContain('印西市')
    const d9 = buildDocument('D9', results, META)
    expect(d9).toContain('令42条')
    expect(d9).toContain('panel-plywood')
  })

  test('buildAllDocuments は 9 件を返し、文字列はエスケープされる', () => {
    const all = buildAllDocuments(house(), { buildingName: '<script>alert(1)</script>' })
    expect(Object.keys(all)).toHaveLength(9)
    expect(all.D1).not.toContain('<script>alert')
    expect(all.D1).toContain('&lt;script&gt;')
  })
})
