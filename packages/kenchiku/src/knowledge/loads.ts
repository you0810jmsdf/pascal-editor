import { REFERENCES } from './references'

// 仕様書 §4.1、HOWTEC 2025-12版。荷重は N/㎡、幾何は m。
export const LOADS = {
  roof: { tile: 990, slate: 740, metal: 500 },
  exteriorWall: { earthen: 1000, mortar: 890, siding: 600, metal: 500, board: 350 },
  pv: { none: 0, standard: 200 },
  ceilingInsulation: 100,
  wallInsulation: 70,
  opening: 400,
  openingRatio: 0.09,
  innerWall: 200,
  innerWallHeight: 2.8,
  floor: 610,
  liveSeismic: { house: 600, office: 800 },
  liveColumn: { house: 1300, office: 1800 },
  referenceX: 6,
  referenceY: 16.5,
  rt: 1,
  baseHeight: 0.5,
  columnArea: 5,
  kd: 1.1,
  defaultFc: 17.7,
  references: [REFERENCES.howtec, REFERENCES.liveLoad, REFERENCES.seismic],
} as const

// 仕様書 §4.4（令46条4項）。
export const WIND = {
  defaultCoefficient: 50,
  maxCoefficient: 75,
  excludedHeight: 1.35,
  references: [REFERENCES.wall],
} as const
