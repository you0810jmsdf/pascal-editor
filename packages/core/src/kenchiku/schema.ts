import { BEARING_RATIOS, type BearingKind } from '@nsfactory/kenchiku'
import { z } from 'zod'

export const JpSite = z
  .object({
    zoning: z
      .enum([
        'R1-low',
        'R2-low',
        'R-garden',
        'R1-mid',
        'R2-mid',
        'R1',
        'R2',
        'quasi-R',
        'neighbor-com',
        'com',
        'quasi-ind',
        'ind',
        'ind-only',
        'none',
      ])
      .optional(), // 用途地域
    kenpeiPct: z.number().min(0).max(100).optional(), // 指定建ぺい率
    yosekiPct: z.number().min(0).max(1300).optional(), // 指定容積率
    cornerLotBonus: z.boolean().optional(), // 角地緩和 +10
    fireZone: z.enum(['none', 'quasi', 'fire', 'art22']).optional(),
    heightDistrict: z.string().optional(),
    absoluteHeightLimit: z.number().optional(), // 低層住専 10/12 m
    wallSetback: z.number().optional(), // 外壁後退 1.0/1.5 m
    roads: z
      .array(
        z.object({
          edgeIndex: z.number().int(),
          width: z.number(),
          type: z.enum(['art42-1', 'art42-2', 'other']),
        }),
      )
      .optional(), // 接道（敷地境界の辺番号と幅員）
    shadowRegulation: z
      .object({ measureHeight: z.number(), hours5to10: z.number(), hoursOver10: z.number() })
      .optional(),
    seismicC0: z.union([z.literal(0.2), z.literal(0.3)]).optional(),
    windCoef: z.number().min(50).max(75).optional(),
    snow: z.object({ depthCm: z.number(), unitNPerM2PerCm: z.number() }).optional(),
    energyRegion: z.number().int().min(1).max(8).optional(), // 省エネ地域区分
    authority: z.string().optional(), // 提出先メモ（例: 印西市 開発建築課）
    notes: z.string().optional(),
  })
  .optional()

export const JpBuilding = z
  .object({
    structure: z
      .enum(['wood-conventional', 'wood-3storey', 'steel', 'rc'])
      .default('wood-conventional'),
    roofKind: z.enum(['tile', 'slate', 'metal']).optional(),
    extWall: z.enum(['earthen', 'mortar', 'siding', 'metal', 'board']).optional(),
    pv: z
      .object({ kind: z.enum(['none', 'standard', 'custom']), loadNPerM2: z.number().optional() })
      .optional(),
    ceilingInsulationNPerM2: z.number().optional(),
    wallInsulationNPerM2: z.number().optional(),
    use: z.enum(['house', 'office']).optional(),
    roofRiseOverride: z.number().optional(), // 最高高さ−軒高（屋根ノードから自動算出できないとき）
    overhangOverride: z.number().optional(),
    pitchSunOverride: z.number().optional(),
    timber: z.object({ standard: z.string(), species: z.string(), grade: z.string() }).optional(),
    minBearingLength: z.number().optional(),
    quasiWalls: z.boolean().optional(),
    foundation: z
      .object({ type: z.enum(['strip', 'mat', 'pile']), soilBearingKnM2: z.number().optional() })
      .optional(), // 参考章用
  })
  .optional()

export const JpWall = z
  .object({
    bearing: z
      .object({
        kinds: z
          .array(z.enum(Object.keys(BEARING_RATIOS) as [BearingKind, ...BearingKind[]]))
          .min(1), // 併用は複数
        ratioOverride: z.number().min(0).max(7).optional(),
        faces: z.enum(['one', 'both']).optional(),
        quasi: z
          .object({ kind: z.enum(['panel', 'lath']), panelHeightRatio: z.number().min(0).max(1) })
          .optional(),
      })
      .optional(),
    exterior: z.boolean().optional(), // 外壁（延焼ライン・外壁後退・見付面積の判定に使う。未指定なら外周判定）
  })
  .optional()

export const JpZone = z
  .object({
    roomKind: z
      .enum(['living', 'non-living', 'kitchen', 'toilet', 'bath', 'stair', 'corridor', 'storage'])
      .optional(), // 居室=living
    daylightNeighborDistance: z.number().optional(), // 採光補正係数 d（隣地境界までの水平距離）の手入力
  })
  .optional()
