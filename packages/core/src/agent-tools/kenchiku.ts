import { z } from 'zod'
import { NodeId } from './node-id'

// Japanese building-code tools (木造在来軸組の仕様規定チェックと図書). Contracts stay zod-only
// (contracts-purity): the bearing-wall kinds are spelled out here and a core test pins them to
// `BEARING_RATIOS` in @nsfactory/kenchiku so the two lists cannot drift.
export const JP_BEARING_KINDS = [
  'none',
  'lath-one',
  'lath-both',
  'brace-15x90',
  'brace-30x90',
  'brace-45x90',
  'brace-90x90',
  'brace-15x90-x',
  'brace-30x90-x',
  'brace-45x90-x',
  'brace-90x90-x',
  'panel-plywood',
  'panel-gypsum',
  'panel-other',
  'custom',
] as const

export const JP_DOCUMENT_IDS = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'] as const

const buildingTarget = {
  buildingId: NodeId.optional().describe(
    'The building to check, by id. Default: the only building in the scene (refused when there are several).',
  ),
}

export const jpStructuralCheckTool = {
  name: 'jp_structural_check',
  title: 'Japan: structural check (壁量計算)',
  description:
    'Run the Japanese wood-frame prescriptive structural checks on a building (建築基準法施行令46条4項・告示1100号/1349号/1460号, 2025-04 rules): required wall quantity from loads (必要壁量 Lw), wind wall quantity (見付面積), existing bearing walls (存在壁量) per storey and direction, the quarter method (四分割法), N-value joint hardware (N値計算) and minimum column size (柱の小径). Walls count only when their jp.bearing kinds are set (jp_set_wall_bearing). Returns pass/fail per storey and direction with the numbers and the formula used; results are design references, not a certified calculation.',
  input: buildingTarget,
}

export const jpBuildingCodeCheckTool = {
  name: 'jp_building_code_check',
  title: 'Japan: building-code check (法規チェック)',
  description:
    'Check a building against the non-structural Japanese rules: site rules (接道・建蔽率・容積率・高さ・道路/北側斜線・日影の対象判定・延焼ライン), room rules (採光 1/7・換気 1/20・天井高 2.1m・階段寸法・床高), the energy-efficiency obligation and the confirmation-application route. Site facts (zoning, road width, coverage ratios) come from the site node jp fields; a check whose input is missing is reported as input-needed, never guessed.',
  input: buildingTarget,
}

export const jpSetWallBearingTool = {
  name: 'jp_set_wall_bearing',
  title: 'Japan: set bearing-wall spec (耐力壁の仕様)',
  description:
    'Mark walls as Japanese bearing walls (耐力壁) by their 告示1100号 kind, e.g. panel-plywood (構造用合板 2.5), brace-45x90 (4.5×9cm 筋かい 2.0), brace-45x90-x (たすき掛け 4.0), panel-gypsum (0.9). Several kinds on one wall add up (cap 7.0). custom / panel-other need ratioOverride. clear removes the spec. Only the wall jp.bearing field changes; geometry is untouched.',
  input: {
    wallIds: z.array(NodeId).min(1).describe('Walls to update, by id (get_walls lists them).'),
    kinds: z
      .array(z.enum(JP_BEARING_KINDS))
      .min(1)
      .optional()
      .describe('Bearing kinds to apply. Required unless clear is true.'),
    ratioOverride: z
      .number()
      .min(0)
      .max(7)
      .optional()
      .describe('Wall ratio (壁倍率) for custom / panel-other kinds.'),
    faces: z
      .enum(['one', 'both'])
      .optional()
      .describe('For lath / panel kinds: one or both faces.'),
    clear: z.boolean().optional().describe('true removes the bearing spec from the walls.'),
  },
}

export const jpGetDocumentTool = {
  name: 'jp_get_document',
  title: 'Japan: generate a document (図書)',
  description:
    'Generate one of the Japanese design documents as printable HTML: D1 壁量計算書, D2 四分割法検討書, D3 N値計算書, D4 柱の小径計算書, D5 各階耐力壁配置図, D6 面積表・求積図, D7 建築法チェック結果, D8 提出図書チェックリストと手続き, D9 仕様表. Each page carries the disclaimer that it is a design reference requiring an architect’s verification. The html field holds the whole page.',
  input: {
    doc: z.enum(JP_DOCUMENT_IDS).describe('Document id, D1 to D9.'),
    ...buildingTarget,
    buildingName: z.string().max(120).optional().describe('Name printed on the cover.'),
    address: z.string().max(200).optional().describe('Address printed on the cover.'),
    designer: z.string().max(120).optional().describe('Designer line printed on the cover.'),
  },
}
