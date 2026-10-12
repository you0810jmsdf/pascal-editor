/**
 * N's factory: 家事按分（私用と事業の利用割合）のための部屋の区分。
 * 建築法規の `jp` と同じく、部屋（zone）に任意項目 `ns` として持たせる。
 * 計算そのものは editor 側（純粋関数）。ここは保存される形だけを決める。
 */
import { z } from 'zod'

/** 事業用／私用／共用（兼用） */
export const NS_ZONE_USES = ['business', 'private', 'shared'] as const
export type NsZoneUse = (typeof NS_ZONE_USES)[number]

export const NsZone = z
  .object({
    use: z.enum(NS_ZONE_USES).optional(),
    /** 共用の部屋の事業割合（0〜1）。use が 'shared' のときだけ使う */
    share: z.number().min(0).max(1).optional(),
    /** 総面積に数えるか。未指定は「数える」。バルコニー等を外すときに false */
    count: z.boolean().optional(),
  })
  .optional()

export type NsZone = z.infer<typeof NsZone>
