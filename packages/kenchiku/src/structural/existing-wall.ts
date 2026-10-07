import { explained } from '../explain'
import { BEARING_RULES } from '../knowledge/bearing-ratios'
import type { Dir, JpBuildingInput } from '../model'
import { bearingWalls } from './bearing-wall'
import { EPS } from './polygon'
import { requiredWall } from './required-wall'
import { nonNegative } from './validation'
import { windWall } from './wind'

export function wallSufficiency(
  bearingCm: number,
  quasiCm: number,
  quakeCm: number,
  windCm: number,
) {
  for (const v of [bearingCm, quasiCm, quakeCm, windCm]) nonNegative(v, '壁量')
  const requiredCm = Math.max(quakeCm, windCm)
  const countedQuasiCm = Math.min(quasiCm, requiredCm * BEARING_RULES.quasiRequiredFraction)
  const existingCm = bearingCm + countedQuasiCm
  const ratio = requiredCm === 0 ? null : existingCm / requiredCm
  return explained(
    {
      bearingCm,
      quasiCm,
      countedQuasiCm,
      excludedQuasiCm: quasiCm - countedQuasiCm,
      quakeCm,
      windCm,
      requiredCm,
      existingCm,
      ratio,
      ok: existingCm + EPS >= requiredCm,
    },
    '必要=max(地震,風); 準耐力算入=min(準耐力壁量,必要/2); 存在=耐力+準耐力算入; 充足率=存在/必要',
    `必要=max(${quakeCm},${windCm})=${requiredCm}; 準耐力算入=min(${quasiCm},${requiredCm}/2)=${countedQuasiCm}; 存在=${bearingCm}+${countedQuasiCm}=${existingCm}; 充足率=${ratio ?? '必要0のため対象外'}`,
    BEARING_RULES.references,
    quasiCm > countedQuasiCm ? ['準耐力壁等が必要壁量の1/2を超過。超過分は算入しない。'] : [],
  )
}

export function existingWall(input: JpBuildingInput) {
  const walls = bearingWalls(input)
  const quake = requiredWall(input)
  const wind = windWall(input)
  const rows = walls.value.storeys.flatMap((s, i) =>
    (['x', 'y'] as const).map((direction: Dir) => {
      const segments = s.value.segments.filter((v) => v.value.direction === direction)
      const sum = (quasi: boolean) =>
        segments
          .filter((v) => v.value.quasi === quasi)
          .reduce((total, v) => total + v.value.wallCm, 0)
      const windCm = wind.value.rows.find(
        (r) => r.value.storey === s.value.storey && r.value.direction === direction,
      )!.value.requiredCm
      const check = wallSufficiency(sum(false), sum(true), quake.value.requiredCm[i]!, windCm)
      return explained(
        { storey: s.value.storey, direction, ...check.value },
        check.explain.formula,
        check.explain.substituted,
        check.explain.references,
        check.explain.notes,
        segments.map((s) => s.explain),
      )
    }),
  )
  return explained(
    { rows, ok: rows.every((r) => r.value.ok), walls, quake, wind },
    '全階・X/Y方向が存在壁量≥必要壁量なら総合適合',
    rows.map((r) => `${r.value.storey}階${r.value.direction}:${r.value.ok}`).join('; '),
    BEARING_RULES.references,
    undefined,
    [walls.explain, quake.explain, wind.explain, ...rows.map((r) => r.explain)],
  )
}
