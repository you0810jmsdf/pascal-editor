import { describe, expect, test } from 'bun:test'
import { building } from '../__fixtures__/building'
import type { JpBuildingInput, JpRoom, JpSiteInput } from '../model'
import {
  checkAbsoluteHeight,
  checkBuildingCode,
  checkCeilingHeight,
  checkDaylight,
  checkFireSpread,
  checkKenpei,
  checkNorthSlope,
  checkProcedure,
  checkRoad,
  checkRoadSlope,
  checkShadow,
  checkStairs,
  checkVentilation,
  checkWallSetback,
  checkYoseki,
  daylightFactor,
} from './index'

// 敷地 15m × 20m = 300㎡。建物 10m × 6m は (0,0)〜(10,6) に置かれ、南辺 y=-2 が道路（幅員 4m）。
const SITE: JpSiteInput = {
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
  wallSetback: 1.0,
  fireZone: 'quasi',
  energyRegion: 6,
}

function withSite(site: Partial<JpSiteInput> | null = {}): JpBuildingInput {
  const b = building()
  b.site = site === null ? undefined : { ...SITE, ...site }
  return b
}

function room(overrides: Partial<JpRoom> = {}): JpRoom {
  return {
    id: 'zone_1',
    name: 'LDK',
    polygon: [
      [0, 0],
      [3.5, 0],
      [3.5, 4],
      [0, 4],
    ],
    area: 14,
    kind: 'living',
    ceilingHeight: 2.4,
    windows: [{ u: 1, width: 2, bottom: 0.9, height: 1, kind: 'window' }],
    daylightNeighborDistance: 1.84, // h = 6 − 1.4 = 4.6 → d/h = 0.4 → A = 0.4×6 − 1.4 = 1.0
    ...overrides,
  }
}

describe('単体規定（§11 の境界値）', () => {
  test('採光：14㎡ の居室に窓 2.0㎡・A=1.0 で 1/7 ちょうど → ok、1.99㎡ → ng', () => {
    const b = withSite()
    b.storeys[0]!.rooms = [room()]
    const [ok] = checkDaylight(b)
    expect(ok!.status).toBe('ok')
    expect(ok!.explain.substituted).toContain('A=1.00')
    b.storeys[0]!.rooms = [
      room({ windows: [{ u: 1, width: 1.99, bottom: 0.9, height: 1, kind: 'window' }] }),
    ]
    expect(checkDaylight(b)[0]!.status).toBe('ng')
    b.storeys[0]!.rooms = [room({ daylightNeighborDistance: undefined })]
    expect(checkDaylight(b)[0]!.status).toBe('input-needed')
    b.storeys[0]!.rooms = [room({ windows: [] })]
    expect(checkDaylight(b)[0]!.status).toBe('ng')
    b.storeys[0]!.rooms = [room({ kind: 'storage' })]
    expect(checkDaylight(b)[0]!.status).toBe('n/a')
  })

  test('採光補正係数は用途地域で式が変わり 0〜3 に収まる', () => {
    expect(daylightFactor(0.4 * 4.6, 4.6, 'residential')).toBeCloseTo(1.0, 9)
    expect(daylightFactor(2, 10, 'commercial')).toBeCloseTo(1.0, 9) // 0.2×10−1.0
    expect(daylightFactor(2, 8, 'industrial')).toBeCloseTo(1.0, 9) // 0.25×8−1.0
    expect(daylightFactor(100, 1, 'residential')).toBe(3)
    expect(daylightFactor(0, 1, 'residential')).toBe(0)
  })

  test('換気：1/20 ちょうどで ok、不足で ng、開放面積未入力は窓の半分で概算して warn', () => {
    const b = withSite()
    b.storeys[0]!.rooms = [room({ openableArea: 0.7 })]
    expect(checkVentilation(b)[0]!.status).toBe('ok')
    b.storeys[0]!.rooms = [room({ openableArea: 0.69 })]
    expect(checkVentilation(b)[0]!.status).toBe('ng')
    b.storeys[0]!.rooms = [room()]
    expect(checkVentilation(b)[0]!.status).toBe('warn') // 2.0×0.5 = 1.0 ≧ 0.7
  })

  test('天井高：2.1m で ok、2.09m で ng', () => {
    const b = withSite()
    b.storeys[0]!.rooms = [room({ ceilingHeight: 2.1 })]
    expect(checkCeilingHeight(b)[0]!.status).toBe('ok')
    b.storeys[0]!.rooms = [room({ ceilingHeight: 2.09 })]
    expect(checkCeilingHeight(b)[0]!.status).toBe('ng')
  })

  test('階段：23/15/75cm の境界で ok、1mm 外れると ng、2階建てで階段が無ければ warn', () => {
    const b = withSite()
    b.storeys[0]!.stairs = [{ id: 'stair_1', riser: 0.23, tread: 0.15, width: 0.75 }]
    expect(checkStairs(b)[0]!.status).toBe('ok')
    b.storeys[0]!.stairs = [{ id: 'stair_1', riser: 0.231, tread: 0.15, width: 0.75 }]
    expect(checkStairs(b)[0]!.status).toBe('ng')
    expect(checkStairs(b)[0]!.message).toContain('蹴上')
    b.storeys[0]!.stairs = []
    expect(checkStairs(b)[0]!.status).toBe('warn')
  })
})

describe('集団規定', () => {
  test('接道：15m 接道・幅員 4m で ok、2項道路は warn、幅 3m の「その他」は ng、未入力は input-needed', () => {
    expect(checkRoad(withSite()).status).toBe('ok')
    expect(
      checkRoad(withSite({ roads: [{ edgeIndex: 0, width: 3.6, type: 'art42-2' }] })).status,
    ).toBe('warn')
    expect(checkRoad(withSite({ roads: [{ edgeIndex: 0, width: 3, type: 'other' }] })).status).toBe(
      'ng',
    )
    expect(checkRoad(withSite({ roads: undefined })).status).toBe('input-needed')
    expect(checkRoad(withSite(null)).status).toBe('input-needed')
  })

  test('建蔽率：60/300 = 20%。指定 20% で ok、19% で ng、角地緩和 +10 で 15%+10 なら ok', () => {
    expect(checkKenpei(withSite({ kenpeiPct: 20 })).status).toBe('ok')
    expect(checkKenpei(withSite({ kenpeiPct: 19 })).status).toBe('ng')
    expect(checkKenpei(withSite({ kenpeiPct: 15, cornerLotBonus: true })).status).toBe('ok')
    expect(checkKenpei(withSite({ kenpeiPct: 20 })).measured).toContain('20.0%')
  })

  test('容積率：120/300 = 40%。指定 40% で ok、39% で ng、道路が無ければ warn', () => {
    expect(checkYoseki(withSite({ yosekiPct: 40 })).status).toBe('ok')
    expect(checkYoseki(withSite({ yosekiPct: 39 })).status).toBe('ng')
    expect(checkYoseki(withSite({ yosekiPct: 40, roads: undefined })).status).toBe('warn')
    // 前面道路 4m × 4/10 = 160% が指定 200% より小さいので限度は 160%
    expect(checkYoseki(withSite({ yosekiPct: 200 })).limit).toContain('160%')
  })

  test('絶対高さ：最高高さ 6.5m（3+3+0.5）。限度 10m で ok、6m で ng、低層で未入力は input-needed', () => {
    expect(checkAbsoluteHeight(withSite()).status).toBe('ok')
    expect(checkAbsoluteHeight(withSite({ absoluteHeightLimit: 6 })).status).toBe('ng')
    expect(checkAbsoluteHeight(withSite({ absoluteHeightLimit: undefined })).status).toBe(
      'input-needed',
    )
    expect(
      checkAbsoluteHeight(withSite({ absoluteHeightLimit: undefined, zoning: 'com' })).status,
    ).toBe('n/a')
  })

  test('外壁後退：境界まで 2m。1.5m なら ok、2.5m なら ng、指定なし（0）は n/a', () => {
    expect(checkWallSetback(withSite({ wallSetback: 1.5 })).status).toBe('ok')
    expect(checkWallSetback(withSite({ wallSetback: 2.5 })).status).toBe('ng')
    expect(checkWallSetback(withSite({ wallSetback: 0 })).status).toBe('n/a')
  })

  test('道路斜線：1.25×(2+4+2)=10m ≧ 6.5m で ok、建物が高いと ng', () => {
    expect(checkRoadSlope(withSite()).status).toBe('ok')
    const tall = withSite()
    tall.roof.rise = 4 // 最高高さ 10m：最も近い頂点で 1.25×8 = 10 ちょうど
    expect(checkRoadSlope(tall).status).toBe('ok')
    tall.roof.rise = 4.1
    expect(checkRoadSlope(tall).status).toBe('ng')
  })

  test('北側斜線：真北（−y）の境界が道路なら幅員を加え、5+1.25×6=12.5m で ok。境界が近く道路でなければ ng', () => {
    expect(checkNorthSlope(withSite()).status).toBe('ok')
    const tight = withSite({
      polygon: [
        [-2, -0.5],
        [13, -0.5],
        [13, 18],
        [-2, 18],
      ],
      roads: [{ edgeIndex: 2, width: 4, type: 'art42-1' }],
    })
    // d = 0.5 → 5 + 0.625 = 5.625 < 6.5
    expect(checkNorthSlope(tight).status).toBe('ng')
    expect(checkNorthSlope(withSite({ zoning: 'com' })).status).toBe('n/a')
  })

  test('日影：低層で軒高 6m・2階建ては対象外、軒高 8m なら対象（warn）', () => {
    expect(checkShadow(withSite()).status).toBe('n/a')
    const high = withSite()
    high.storeys[0]!.height = 4
    high.storeys[1]!.height = 4
    expect(checkShadow(high).status).toBe('warn')
  })

  test('延焼のおそれ：境界から 2m の外壁開口は 1階 3m 以内で該当。準防火なら warn、指定なしなら n/a、未入力なら input-needed', () => {
    const b = withSite()
    b.storeys[0]!.walls = [
      {
        id: 'wall_w',
        start: [0, 0],
        end: [0, 6],
        thickness: 0.12,
        height: 2.9,
        exterior: true,
        openings: [{ u: 3, width: 1.65, bottom: 0.9, height: 1.1, kind: 'window' }],
      },
    ]
    const quasi = checkFireSpread(b)
    expect(quasi.status).toBe('warn')
    expect(quasi.measured).toContain('1 箇所')
    b.site!.fireZone = 'none'
    expect(checkFireSpread(b).status).toBe('n/a')
    b.site!.fireZone = undefined
    expect(checkFireSpread(b).status).toBe('input-needed')
    // 開口を境界から 4m 離せば該当なし
    b.site!.fireZone = 'fire'
    b.storeys[0]!.walls[0]!.start = [2, 0]
    b.storeys[0]!.walls[0]!.end = [2, 6]
    expect(checkFireSpread(b).status).toBe('ok')
  })

  test('手続き：2階建て 120㎡ は新2号・仕様規定で ok、延べ 320㎡ は許容応力度計算の warn', () => {
    const b = withSite()
    const p = checkProcedure(b)
    expect(p.status).toBe('ok')
    expect(p.message).toContain('新2号')
    expect(p.message).toContain('35日')
    b.storeys[0]!.floorArea = 260
    expect(checkProcedure(b).status).toBe('warn')
  })
})

describe('一式のレポート', () => {
  test('全チェックを集計し、ng と input-needed が無ければ ok', () => {
    const b = withSite()
    b.storeys[0]!.rooms = [room({ openableArea: 1.0 })]
    b.storeys[0]!.stairs = [{ id: 'stair_1', riser: 0.2, tread: 0.22, width: 0.8 }]
    b.firstFloorHeight = 0.5
    const report = checkBuildingCode(b)
    const ids = report.value.checks.map((c) => c.id)
    expect(ids).toContain('site.road')
    expect(ids).toContain('room.daylight.zone_1')
    expect(ids).toContain('procedure')
    expect(report.value.counts.ng).toBe(0)
    expect(report.value.counts['input-needed']).toBe(0)
    expect(report.value.ok).toBe(true)
    for (const c of report.value.checks) {
      expect(c.explain.references.length).toBeGreaterThan(0)
      expect(c.explain.references[0]!.url).toMatch(/^https:\/\//)
    }
  })

  test('敷地が無ければ集団規定は input-needed で止まり、無理に判定しない', () => {
    const report = checkBuildingCode(withSite(null))
    const site = report.value.checks.filter((c) => c.id.startsWith('site.'))
    expect(site.filter((c) => c.status === 'input-needed').length).toBeGreaterThanOrEqual(5)
    expect(report.value.ok).toBe(false)
  })
})
