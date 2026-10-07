import { woodTwoStoreyScene } from '../../kenchiku/__fixtures__/wood-two-storey'
import type { AnyNode } from '../../schema'
import type { AgentToolCase, SceneGraph } from './cases'

// 木造2階建て 7.28×9.1m（packages/core/src/kenchiku/__fixtures__）。屋根諸元は上書きで与える。
const BUILDING_JP = {
  roofKind: 'slate',
  extWall: 'siding',
  roofRiseOverride: 1.2,
  overhangOverride: 0.5,
  pitchSunOverride: 4,
}

function house(options: { bearing?: boolean; site?: boolean } = {}): SceneGraph {
  const nodes = woodTwoStoreyScene({
    buildingJp: BUILDING_JP,
    siteJp: options.site
      ? { zoning: 'R1-low', kenpeiPct: 50, yosekiPct: 100, roads: [{ edgeIndex: 0, width: 4, type: 'art42-1' }], absoluteHeightLimit: 10, wallSetback: 0, fireZone: 'none' }
      : undefined,
  })
  if (options.bearing)
    for (const id of ['wall_1s', 'wall_1e', 'wall_1n', 'wall_1w', 'wall_1ix', 'wall_1iy', 'wall_2s', 'wall_2e', 'wall_2n', 'wall_2w', 'wall_2ix', 'wall_2iy']) {
      const wall = nodes[id] as AnyNode & { type: 'wall' }
      nodes[id] = { ...wall, jp: { bearing: { kinds: ['panel-plywood'] } } } as AnyNode
    }
  return { nodes, rootNodeIds: ['site_1'] }
}

export const KENCHIKU_CASES: AgentToolCase[] = [
  {
    name: 'computes required and existing wall quantity for a two-storey house',
    tool: 'jp_structural_check',
    scene: () => house({ bearing: true }),
    input: {},
    expect: {
      result: { storeyCount: 2 },
      contains: { wallQuantity: [{ storey: 1, direction: 'x' }, { storey: 2, direction: 'y' }], quarterMethod: [{ storey: 1, direction: 'x' }], columns: [{ storey: 1 }] },
      mentions: ['Lw'],
    },
  },
  {
    name: 'walls without a bearing spec give zero existing wall quantity and a failing verdict',
    tool: 'jp_structural_check',
    scene: () => house(),
    input: {},
    expect: { result: { ok: false }, contains: { wallQuantity: [{ storey: 1, direction: 'x', existingCm: 0, ok: false }] } },
  },
  {
    name: 'refuses when the scene has no building',
    tool: 'jp_structural_check',
    scene: () => ({ nodes: {}, rootNodeIds: [] }),
    input: {},
    expect: { refusal: 'jp_not_computable', mentions: ['建物'] },
  },
  {
    name: 'reports input-needed site checks when the site has no jp facts',
    tool: 'jp_building_code_check',
    scene: () => house(),
    input: {},
    expect: { result: { ok: false }, contains: { checks: [{ id: 'site.kenpei', status: 'input-needed' }, { id: 'procedure' }] } },
  },
  {
    name: 'judges coverage and road access once the site facts are set',
    tool: 'jp_building_code_check',
    scene: () => house({ site: true }),
    input: {},
    expect: {
      result: { ok: false }, // 採光の d や床高など人の入力待ちが残るため
      contains: { checks: [{ id: 'site.road', status: 'ok' }, { id: 'site.kenpei', status: 'ok' }, { id: 'room.ceiling.zone_1', status: 'ok' }] },
    },
  },
  {
    name: 'sets a plywood bearing spec on two walls',
    tool: 'jp_set_wall_bearing',
    scene: () => house(),
    input: { wallIds: ['wall_1s', 'wall_1n'], kinds: ['panel-plywood'] },
    expect: {
      result: { updated: ['wall_1s', 'wall_1n'], ratio: 2.5 },
      after: { wall_1s: { jp: { bearing: { kinds: ['panel-plywood'] } } }, wall_1n: { jp: { bearing: { kinds: ['panel-plywood'] } } } },
    },
  },
  {
    name: 'adds brace and board ratios and caps combined ratio at 7',
    tool: 'jp_set_wall_bearing',
    scene: () => house(),
    input: { wallIds: ['wall_1s'], kinds: ['brace-90x90-x', 'panel-plywood', 'panel-gypsum'] },
    expect: { result: { ratio: 7 } },
  },
  {
    name: 'refuses custom kinds without a ratio',
    tool: 'jp_set_wall_bearing',
    scene: () => house(),
    input: { wallIds: ['wall_1s'], kinds: ['custom'] },
    expect: { refusal: 'jp_ratio_required' },
  },
  {
    name: 'refuses a node that is not a wall',
    tool: 'jp_set_wall_bearing',
    scene: () => house(),
    input: { wallIds: ['zone_1'], kinds: ['panel-plywood'] },
    expect: { refusal: 'not_a_wall', mentions: ['zone'] },
  },
  {
    name: 'clears the bearing spec',
    tool: 'jp_set_wall_bearing',
    scene: () => house({ bearing: true }),
    input: { wallIds: ['wall_1s'], clear: true },
    expect: { result: { updated: ['wall_1s'], kinds: [] } },
  },
  {
    name: 'generates the wall quantity document',
    tool: 'jp_get_document',
    scene: () => house({ bearing: true }),
    input: { doc: 'D1', buildingName: 'テスト邸' },
    expect: { result: { doc: 'D1', title: '壁量計算書' }, mentions: ['必要壁量', 'テスト邸', '<!DOCTYPE html>'] },
  },
  {
    name: 'generates the code-check document with the procedure row',
    tool: 'jp_get_document',
    scene: () => house({ site: true }),
    input: { doc: 'D7' },
    expect: { result: { doc: 'D7' }, mentions: ['接道義務', '新2号'] },
  },
]
