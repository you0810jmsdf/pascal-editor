import { CODE_REFERENCES as R } from '../knowledge/code-references'
import type { JpBuildingInput, JpRoom } from '../model'
import { buildingHeights, floorLevels, fmt, totalFloorArea } from './geometry'
import { makeCheck, RESIDENTIAL_ZONES } from './site'
import type { CheckStatus, CodeCheck } from './types'

type DaylightGroup = 'residential' | 'commercial' | 'industrial'

function daylightGroup(zoning: string | undefined): DaylightGroup {
  if (!zoning || RESIDENTIAL_ZONES.has(zoning) || zoning === 'none') return 'residential'
  if (zoning === 'com' || zoning === 'neighbor-com') return 'commercial'
  return 'industrial'
}

/** 令20条の採光補正係数 A（上限 3.0・下限 0）。d: 隣地境界までの水平距離、h: 開口部中心から直上の軒までの垂直距離。 */
export function daylightFactor(d: number, h: number, group: DaylightGroup): number {
  const ratio = d / Math.max(h, 0.1)
  const raw =
    group === 'residential'
      ? ratio * 6 - 1.4
      : group === 'commercial'
        ? ratio * 10 - 1.0
        : ratio * 8 - 1.0
  return Math.max(0, Math.min(3, raw))
}

function livingRooms(input: JpBuildingInput): { room: JpRoom; storeyIndex: number }[] {
  return input.storeys.flatMap((s, storeyIndex) =>
    (s.rooms ?? []).filter((room) => room.kind === 'living').map((room) => ({ room, storeyIndex })),
  )
}

export function checkDaylight(input: JpBuildingInput): CodeCheck[] {
  const rooms = livingRooms(input)
  const title = '居室の採光（有効採光面積 ≧ 床面積 × 1/7）'
  if (!rooms.length)
    return [
      makeCheck('room.daylight', title, 'n/a', R.daylight, '居室（roomKind=living）がありません'),
    ]
  const group = daylightGroup(input.site?.zoning)
  const floors = floorLevels(input.storeys)
  const { eave } = buildingHeights(input)
  return rooms.map(({ room, storeyIndex }) => {
    const id = `room.daylight.${room.id}`
    const required = room.area / 7
    if (!room.windows.length)
      return makeCheck(
        id,
        `${title}：${room.name}`,
        'ng',
        R.daylight,
        '採光に有効な開口部がありません',
        {
          measured: '有効採光面積 0㎡',
          limit: `${fmt(required)}㎡`,
        },
      )
    if (room.daylightNeighborDistance === undefined)
      return makeCheck(
        id,
        `${title}：${room.name}`,
        'input-needed',
        R.daylight,
        '隣地境界線（または道路反対側）までの水平距離 d（daylightNeighborDistance）を入力すると判定できます',
        {
          measured: `開口部 ${room.windows.length} 箇所・開口面積 ${fmt(room.windows.reduce((s, w) => s + w.width * w.height, 0))}㎡`,
          limit: `${fmt(required)}㎡`,
        },
      )
    const d = room.daylightNeighborDistance
    const parts = room.windows.map((w) => {
      const center = floors[storeyIndex]! + w.bottom + w.height / 2
      const h = Math.max(eave - center, 0.1)
      const a = daylightFactor(d, h, group)
      return { area: w.width * w.height, h, a, effective: w.width * w.height * a }
    })
    const effective = parts.reduce((s, p) => s + p.effective, 0)
    const ok = effective + 1e-9 >= required
    return makeCheck(
      id,
      `${title}：${room.name}`,
      ok ? 'ok' : 'ng',
      R.daylight,
      ok
        ? '採光は十分です'
        : '有効採光面積が不足しています（照明設備等による 1/10 への緩和は別途）',
      {
        measured: `有効採光面積 ${fmt(effective)}㎡（${parts.map((p) => `${fmt(p.area)}㎡×A${fmt(p.a)}`).join(' + ')}）`,
        limit: `床面積 ${fmt(room.area)}㎡ × 1/7 = ${fmt(required)}㎡`,
        formula:
          'A = d/h×6−1.4（住居系）/ d/h×10−1.0（商業系）/ d/h×8−1.0（工業系）、0≦A≦3。有効採光面積 = Σ 開口面積 × A',
        substituted: `d=${d}m、h=${parts.map((p) => fmt(p.h)).join('/')}m、A=${parts.map((p) => fmt(p.a)).join('/')}`,
        notes: [
          'h は開口部中心から建物の軒までの垂直距離で近似（直上の庇・上階の張り出しは未考慮）。道路に面する開口の A≧1 の扱いは未考慮。',
        ],
      },
    )
  })
}

export function checkVentilation(input: JpBuildingInput): CodeCheck[] {
  const rooms = livingRooms(input)
  const title = '居室の換気（開放できる開口部 ≧ 床面積 × 1/20）'
  if (!rooms.length)
    return [makeCheck('room.ventilation', title, 'n/a', R.ventilation, '居室がありません')]
  return rooms.map(({ room }) => {
    const id = `room.ventilation.${room.id}`
    const required = room.area / 20
    const estimated = room.openableArea === undefined
    const openable =
      room.openableArea ?? room.windows.reduce((s, w) => s + w.width * w.height, 0) * 0.5
    const ok = openable + 1e-9 >= required
    const status: CheckStatus = !ok ? 'ng' : estimated ? 'warn' : 'ok'
    return makeCheck(
      id,
      `${title}：${room.name}`,
      status,
      R.ventilation,
      !ok
        ? '換気に有効な開口部が不足しています（機械換気設備で代替可）'
        : estimated
          ? '窓面積の 1/2 を開放可能とみなした概算で満たします（引違い窓相当）。開放面積を入力すると確定します'
          : '換気開口は十分です',
      {
        measured: `開放可能面積 ${fmt(openable)}㎡${estimated ? '（概算）' : ''}`,
        limit: `床面積 ${fmt(room.area)}㎡ × 1/20 = ${fmt(required)}㎡`,
      },
    )
  })
}

export function checkCeilingHeight(input: JpBuildingInput): CodeCheck[] {
  const rooms = livingRooms(input)
  const title = '居室の天井高さ（2.1m 以上）'
  if (!rooms.length) return [makeCheck('room.ceiling', title, 'n/a', R.ceiling, '居室がありません')]
  return rooms.map(({ room }) => {
    const ok = room.ceilingHeight + 1e-9 >= 2.1
    return makeCheck(
      `room.ceiling.${room.id}`,
      `${title}：${room.name}`,
      ok ? 'ok' : 'ng',
      R.ceiling,
      ok ? '天井高さを満たします' : '天井高さが 2.1m 未満です（勾配天井は平均で判定）',
      {
        measured: `${fmt(room.ceilingHeight)}m`,
        limit: '2.1m',
      },
    )
  })
}

export function checkStairs(input: JpBuildingInput): CodeCheck[] {
  const title = '階段の寸法（住宅：蹴上 23cm 以下・踏面 15cm 以上・幅 75cm 以上）'
  const stairs = input.storeys.flatMap((s) => s.stairs ?? [])
  if (!stairs.length) {
    const status: CheckStatus = input.storeys.length >= 2 ? 'warn' : 'n/a'
    return [
      makeCheck(
        'room.stair',
        title,
        status,
        R.stair,
        input.storeys.length >= 2
          ? '2階建て以上ですが階段ノードがありません（階段を置くと自動判定）'
          : '平屋のため対象外',
      ),
    ]
  }
  return stairs.map((stair) => {
    const problems: string[] = []
    if (stair.riser > 0.23 + 1e-9) problems.push(`蹴上 ${fmt(stair.riser * 100, 1)}cm > 23cm`)
    if (stair.tread + 1e-9 < 0.15) problems.push(`踏面 ${fmt(stair.tread * 100, 1)}cm < 15cm`)
    if (stair.width + 1e-9 < 0.75) problems.push(`幅 ${fmt(stair.width * 100, 1)}cm < 75cm`)
    return makeCheck(
      `room.stair.${stair.id}`,
      `${title}：${stair.id}`,
      problems.length ? 'ng' : 'ok',
      R.stair,
      problems.length ? problems.join('、') : '階段の寸法を満たします',
      {
        measured: `蹴上 ${fmt(stair.riser * 100, 1)}cm・踏面 ${fmt(stair.tread * 100, 1)}cm・幅 ${fmt(stair.width * 100, 1)}cm`,
        limit: '蹴上 ≦23cm・踏面 ≧15cm・幅 ≧75cm',
        notes: [
          '手すりの出 10cm までは幅に算入しない・回り階段は狭い側から 30cm の位置で踏面を測る（計測側の前提）。',
        ],
      },
    )
  })
}

export function checkFloorHeight(input: JpBuildingInput): CodeCheck {
  const id = 'room.floorHeight'
  const title = '最下階の居室の床高（45cm 以上）と防湿'
  if (input.firstFloorHeight === undefined)
    return makeCheck(
      id,
      title,
      'input-needed',
      R.floorHeight,
      '1階の床高（地盤面から・firstFloorHeight）を入力すると判定できます。べた基礎や防湿コンクリートなど防湿措置がある床は適用除外',
    )
  const ok = input.firstFloorHeight + 1e-9 >= 0.45
  return makeCheck(
    id,
    title,
    ok ? 'ok' : 'warn',
    R.floorHeight,
    ok
      ? '床高 45cm 以上です（床下換気孔 300㎠/5m 以内ごと も必要）'
      : '床高 45cm 未満。べた基礎・防湿コンクリート等の防湿措置が無ければ不適合',
    {
      measured: `${fmt(input.firstFloorHeight * 100, 0)}cm`,
      limit: '45cm',
    },
  )
}

export function checkKitchenFinish(input: JpBuildingInput): CodeCheck {
  const id = 'room.kitchenFinish'
  const title = '火気使用室の内装制限'
  const kitchens = input.storeys.flatMap((s, i) =>
    (s.rooms ?? [])
      .filter((r) => r.kind === 'kitchen')
      .map((r) => ({ r, top: i === input.storeys.length - 1 })),
  )
  if (!kitchens.length)
    return makeCheck(id, title, 'n/a', R.kitchenFinish, '台所（roomKind=kitchen）がありません')
  const restricted = kitchens.filter((k) => !k.top)
  if (!restricted.length)
    return makeCheck(
      id,
      title,
      'n/a',
      R.kitchenFinish,
      '台所は最上階にあるため内装制限の対象外（住宅・2階建て以下）',
    )
  return makeCheck(
    id,
    title,
    'warn',
    R.kitchenFinish,
    `${restricted.map((k) => k.r.name).join('、')} は最上階以外の火気使用室のため、壁・天井を準不燃材料等にするか、告示の緩和（コンロ周り区画）を適用する必要があります`,
  )
}

export function checkEnergy(input: JpBuildingInput): CodeCheck {
  const id = 'energy.required'
  const title = '省エネ基準への適合（2025年4月以降の新築は全て義務）'
  const region = input.site?.energyRegion
  const notes = [
    '住宅は省エネ適合性判定の対象外で、建築確認の中で審査される（省エネ法仕様基準等確認図書を添付）。',
    '仕様基準（部位ごとの断熱材・開口部の基準）に適合すれば一次エネルギー消費量の計算を省略できる。',
    '計算で示す場合は建築研究所「エネルギー消費性能計算プログラム（住宅版）」を使う。',
  ]
  return makeCheck(
    id,
    title,
    'warn',
    R.energy,
    `断熱等性能等級4・一次エネルギー消費量等級4 相当（例：5〜7地域 UA ≦ 0.87、6地域 ηAC ≦ 2.8、BEI ≦ 1.0）への適合を、仕様基準または計算で示す必要があります${region ? `（地域区分 ${region}）` : '（省エネ地域区分 energyRegion を入力すると基準値を絞り込めます）'}`,
    {
      limit: 'UA ≦ 0.87（5〜7地域）/ ηAC ≦ 2.8（6地域）/ BEI ≦ 1.0、または仕様基準',
      notes,
    },
  )
}

export function checkProcedure(input: JpBuildingInput): CodeCheck {
  const id = 'procedure'
  const title = '確認申請の区分と手続き'
  const storeys = input.storeys.length
  const total = totalFloorArea(input)
  const { top } = buildingHeights(input)
  const second = storeys >= 2 || total > 200
  const category = second
    ? '新2号建築物（木造2階建て以上または延べ200㎡超）'
    : '新3号建築物（木造平屋・延べ200㎡以下）'
  const specRoute = storeys <= 2 && total <= 300 && top <= 16
  const route = specRoute
    ? '構造は仕様規定（壁量計算・四分割法・N値計算・柱の小径・基礎告示）で確認'
    : '許容応力度計算が必要（フェーズB）'
  const days = second ? '審査期間 35日以内' : '審査期間 7日以内'
  const docs = second
    ? '構造関係図書（各階耐力壁図・壁量計算書・N値表・柱の小径・基礎伏図等）と省エネ図書を添付'
    : '構造審査は省略（図書の一部を省略可）。壁量計算自体は令46条4項により必要'
  const authority =
    input.site?.authority ??
    '提出先：所在地の建築主事（印西市は2階以下・延べ300㎡以下・高さ16m以下なら市の建築指導係、超える規模は千葉県印旛土木事務所）または指定確認検査機関'
  return makeCheck(
    id,
    title,
    specRoute ? 'ok' : 'warn',
    R.procedure,
    `${category}。${route}。${days}。${docs}。${authority}`,
    {
      measured: `階数 ${storeys}・延べ面積 ${fmt(total)}㎡・最高高さ ${fmt(top)}m`,
      limit: '仕様規定：階数2以下・延べ300㎡以下・高さ16m以下',
      notes: [
        '確認済証 → 着工 → （中間検査：千葉県指定では非分譲の木造2階建ては対象外）→ 完了検査 → 検査済証。',
        '建築工事届（10㎡超）は建築主が建築主事を経由して知事へ。建築計画概要書は閲覧対象。',
      ],
    },
  )
}

export function roomChecks(input: JpBuildingInput): CodeCheck[] {
  return [
    ...checkDaylight(input),
    ...checkVentilation(input),
    ...checkCeilingHeight(input),
    ...checkStairs(input),
    checkFloorHeight(input),
    checkKitchenFinish(input),
    checkEnergy(input),
    checkProcedure(input),
  ]
}
