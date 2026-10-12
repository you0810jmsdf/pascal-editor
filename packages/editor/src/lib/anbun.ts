/**
 * N's factory: 家事按分（私用と事業の利用割合）の計算。画面・シーンに依存しない純粋関数。
 *
 * 按分率 = 事業分の面積 ÷ 総面積
 *   事業分の面積 = Σ 事業用の部屋 ＋ Σ（共用の部屋 × 共用割合）
 *   総面積       = Σ「数える」部屋（未指定は数える）
 * 面積は呼び出し側が渡す（内法＝壁の内側で測った値を想定）。
 */
import type { NsZoneUse } from '@pascal-app/core'

export type AnbunRoomInput = {
  id: string
  name: string
  /** 階の表示名（例「1階」） */
  level: string
  /** 面積（㎡）。内法 */
  area: number
  use?: NsZoneUse
  share?: number
  count?: boolean
}

export type AnbunRoomRow = AnbunRoomInput & {
  use: NsZoneUse
  share: number
  count: boolean
  /** 事業分として数えた面積（㎡） */
  businessArea: number
}

export type AnbunResult = {
  rows: AnbunRoomRow[]
  /** 総面積（数える部屋の合計・㎡） */
  totalArea: number
  /** 事業分の面積（㎡） */
  businessArea: number
  /** 按分率（0〜1）。総面積が 0 なら null */
  ratio: number | null
  /** 区分が未設定の部屋の数（私用扱いで計算している） */
  unsetCount: number
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)

export function computeAnbun(rooms: readonly AnbunRoomInput[]): AnbunResult {
  const rows: AnbunRoomRow[] = []
  let totalArea = 0
  let businessArea = 0
  let unsetCount = 0
  for (const room of rooms) {
    const area = Number.isFinite(room.area) && room.area > 0 ? room.area : 0
    if (room.use === undefined) unsetCount++
    const use: NsZoneUse = room.use ?? 'private'
    const share = use === 'shared' ? clamp01(room.share ?? 0) : use === 'business' ? 1 : 0
    const count = room.count ?? true
    const roomBusiness = count ? area * share : 0
    if (count) {
      totalArea += area
      businessArea += roomBusiness
    }
    rows.push({ ...room, area, use, share, count, businessArea: roomBusiness })
  }
  return {
    rows,
    totalArea,
    businessArea,
    ratio: totalArea > 0 ? businessArea / totalArea : null,
    unsetCount,
  }
}

/** 56.96 のような % 表示（小数2桁）。null は「—」 */
export function formatRatio(ratio: number | null): string {
  return ratio === null ? '—' : `${(ratio * 100).toFixed(2)}%`
}

/** ㎡ の表示（小数2桁） */
export const formatM2 = (m2: number) => `${m2.toFixed(2)} ㎡`

/** 根拠表の CSV（UTF-8・BOM 付き。Excel で開ける） */
export function anbunCsv(
  result: AnbunResult,
  meta: { title: string; date: string; note?: string },
): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const useLabel: Record<NsZoneUse, string> = {
    business: '事業用',
    private: '私用',
    shared: '共用',
  }
  const lines: string[] = []
  lines.push([esc(meta.title), esc(meta.date)].join(','))
  if (meta.note) lines.push(esc(meta.note))
  lines.push('')
  lines.push(
    ['階', '部屋', '面積(㎡)', '区分', '共用割合', '総面積に数える', '事業分(㎡)']
      .map(esc)
      .join(','),
  )
  for (const r of result.rows) {
    lines.push(
      [
        esc(r.level),
        esc(r.name),
        esc(r.area.toFixed(2)),
        esc(useLabel[r.use]),
        esc(r.use === 'shared' ? `${(r.share * 100).toFixed(0)}%` : ''),
        esc(r.count ? '○' : '×'),
        esc(r.businessArea.toFixed(2)),
      ].join(','),
    )
  }
  lines.push('')
  lines.push([esc('総面積(㎡)'), esc(result.totalArea.toFixed(2))].join(','))
  lines.push([esc('事業分(㎡)'), esc(result.businessArea.toFixed(2))].join(','))
  lines.push([esc('按分率'), esc(formatRatio(result.ratio))].join(','))
  lines.push(
    [esc('計算式'), esc('按分率 = 事業分の面積 ÷ 総面積（面積は部屋の内側＝内法で計測）')].join(
      ',',
    ),
  )
  // 先頭に BOM（Excel が UTF-8 と判定する）。文字そのものを書くと見えないので、コードで作る
  return `${String.fromCharCode(0xfeff)}${lines.join('\r\n')}\r\n`
}
