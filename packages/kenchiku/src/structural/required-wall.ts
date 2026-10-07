import { explained } from '../explain'
import { LOADS } from '../knowledge/loads'
import { REFERENCES } from '../knowledge/references'
import type { JpBuildingInput } from '../model'
import { buildingLoads, roundup } from './loads'
import { validateBuilding } from './validation'

const references = [REFERENCES.wall, REFERENCES.seismic, REFERENCES.howtec]

function calculate(input: JpBuildingInput, snowKn: number, multiplier: number) {
  const loads = buildingLoads(input)
  const { z2, walls } = loads.value
  const roofUnit = loads.value.roof + snowKn
  const first = input.storeys[0]!
  const second = input.storeys[1]
  const r = second ? second.floorArea / first.floorArea : 1
  const roof = roofUnit * r
  const wall1 = walls[0]!.value.total
  const wall2 = second ? walls[1]!.value.total * r : 0
  const floor2 = second ? ((LOADS.floor + LOADS.liveSeismic[input.use]) * r) / 1000 : 0
  const lean = second && r < 1 ? (1 - r) * roofUnit : 0
  const w1 = roof + wall2 + floor2 + 0.5 * wall1 + lean
  const w2 = second ? roof + 0.5 * wall2 : undefined
  const h =
    input.roof.rise / 2 + input.storeys.reduce((sum, s) => sum + s.height, 0) + LOADS.baseHeight
  const t = 0.03 * h
  const alpha2 = w2 === undefined ? undefined : w2 / w1
  const a2 =
    alpha2 === undefined ? undefined : 1 + ((1 / Math.sqrt(alpha2) - alpha2) * 2 * t) / (1 + 3 * t)
  const lw = [roundup((multiplier * input.c0 * LOADS.rt * w1) / 0.0196)]
  if (w2 !== undefined && a2 !== undefined)
    lw.push(roundup((multiplier * a2 * input.c0 * LOADS.rt * w2) / 0.0196 / r))
  return explained(
    {
      lw,
      requiredCm: lw.map((l, i) => l * input.storeys[i]!.floorArea),
      z2,
      h,
      t,
      r,
      alpha2,
      a2,
      w1,
      w2,
      parts: { roof, wall2, floor2, wall1, lean },
    },
    'r=Af2/Af1（平屋は1）; W1=Wroof+Wwall2+Wfloor2+0.5Wwall1+Wlean; W2=Wroof+0.5Wwall2; h=rise/2+Σhi+0.5; T=0.03h; α2=W2/W1; A2=1+(1/√α2−α2)·2T/(1+3T); Lw1=ceil(m·C0·Rt·W1/0.0196); Lw2=ceil(m·A2·C0·Rt·W2/0.0196/r); 必要壁量=Lw·Af',
    `Af=${input.storeys.map((s) => s.floorArea)}; r=${r}; 屋根加算積雪=${snowKn}kN/㎡; Wroof=${roof}; Wwall2=${wall2}; Wfloor2=${floor2}; Wwall1=${wall1}; Wlean=${lean}; W1=${w1}; W2=${w2 ?? '対象外'}; rise=${input.roof.rise}; h=${h}; T=${t}; α2=${alpha2 ?? '対象外'}; A2=${a2 ?? '対象外'}; m=${multiplier}; C0=${input.c0}; Rt=${LOADS.rt}; Lw=${lw}`,
    references,
    ['W1/W2は1階床面積あたりのkN/㎡。平屋は上階荷重とA2を用いない。'],
    [loads.explain],
  )
}

/** 仕様書 §6.2。階の昇順で Lw(cm/㎡) と必要壁量(cm)を返す。 */
export function requiredWall(input: JpBuildingInput) {
  validateBuilding(input)
  const base = calculate(input, 0, 1)
  const snow = input.snow
  const snowKn = snow
    ? (((snow.depthCm * snow.unitNPerM2PerCm * 0.35 * base.value.z2) /
        Math.sqrt(input.roof.pitchSun ** 2 + 100)) *
        10) /
      1000
    : 0
  const grade2 = calculate(input, snowKn, 1.25)
  const grade3 = calculate(input, snowKn, 1.5)
  const snowExplain = explained(
    snowKn,
    'S=depth·unit·0.35·Z2/√(p²+10²)·10/1000（kN/㎡、等級2/3の参考値のみ）',
    `depth=${snow?.depthCm ?? 0}; unit=${snow?.unitNPerM2PerCm ?? 0}; Z2=${base.value.z2}; p=${input.roof.pitchSun}; S=${snowKn}`,
    references,
  )
  return explained(
    { ...base.value, referenceGrades: { grade2, grade3 } },
    base.explain.formula,
    base.explain.substituted,
    references,
    [
      ...(base.explain.notes ?? []),
      '等級2/3は参考（品確法）。積雪を屋根・下屋に加算し、倍率1.25/1.5を切上げ前に適用。',
    ],
    [...(base.explain.steps ?? []), snowExplain.explain, grade2.explain, grade3.explain],
  )
}
