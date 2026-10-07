import { REFERENCES } from './references'

// 仕様書 §4.2、告示1100号 別表第1。null は入力または併用計算を要する。
export const BEARING_RATIOS = {
  none: 0,
  'lath-one': 0.5,
  'lath-both': 1,
  'brace-15x90': 1,
  'brace-30x90': 1.5,
  'brace-45x90': 2,
  'brace-90x90': 3,
  'brace-15x90-x': 2,
  'brace-30x90-x': 3,
  'brace-45x90-x': 4,
  'brace-90x90-x': 5,
  'panel-plywood': 2.5,
  'panel-gypsum': 0.9,
  'panel-other': null,
  custom: null,
  combined: null,
} as const
export type BearingKind = keyof typeof BEARING_RATIOS
export const BEARING_RULES = {
  combinedLimit: 7,
  crossed90Limit: 5,
  braceHeightThreshold: 3.2,
  braceHeightFactor: 3.5,
  minLength: 0.9,
  quasiPanelFactor: 0.6,
  quasiLathFactor: 0.5,
  quasiFaceLimit: 1.5,
  quasiRequiredFraction: 0.5,
  references: [REFERENCES.wall, REFERENCES.guidance],
} as const
