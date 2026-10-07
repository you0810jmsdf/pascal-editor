import { explained } from '../explain'
import { LOADS } from '../knowledge/loads'
import type { JpBuildingInput } from '../model'

// オラクル roundup: 切上げ前に小数9桁へ丸め、浮動小数の境界誤差を除く。
export function roundup(value: number, digits = 0): number {
  const factor = 10 ** digits
  return Math.ceil(Number((value * factor).toFixed(9))) / factor
}

export function buildingLoads(input: JpBuildingInput) {
  const { overhang: ov, pitchSun: p } = input.roof
  const z2 =
    ((LOADS.referenceY + 2 * ov) * (LOADS.referenceX + 2 * ov) * Math.sqrt(p ** 2 + 100)) /
    (LOADS.referenceX * LOADS.referenceY) /
    10
  const pv = input.pv.kind === 'custom' ? input.pv.loadNPerM2! : LOADS.pv[input.pv.kind]
  const roof = (LOADS.roof[input.roof.kind] * z2 + pv * z2 + input.ceilingInsulationNPerM2) / 1000
  const walls = input.storeys.map((s) => {
    const surface = (6 * s.height * 2 + 16.5 * s.height * 2) / (6 * 16.5)
    const exterior = roundup(
      LOADS.exteriorWall[input.extWall] * surface * (1 - LOADS.openingRatio),
      -1,
    )
    const insulation = roundup(input.wallInsulationNPerM2 * surface * (1 - LOADS.openingRatio), -1)
    const opening = roundup(LOADS.opening * surface * LOADS.openingRatio, -1)
    const inner = (LOADS.innerWall * s.height) / LOADS.innerWallHeight
    return explained(
      {
        total: (exterior + insulation + opening + inner) / 1000,
        inner: inner / 1000,
        exterior,
        insulation,
        opening,
      },
      'Wwall(h) = (ceil10(G2·45h·0.91/99) + 200h/2.8 + ceil10(D3·45h·0.91/99) + ceil10(400·45h·0.09/99))/1000',
      `h=${s.height}; G2=${LOADS.exteriorWall[input.extWall]}; D3=${input.wallInsulationNPerM2}; Wwall=(${exterior}+${inner}+${insulation}+${opening})/1000`,
      LOADS.references,
    )
  })
  return explained(
    { z2, roof, walls },
    "Z2=(16.5+2ov)(6+2ov)√(p²+10²)/(16.5·6)/10; Wroof'=((G1+D2)Z2+D1)/1000",
    `ov=${ov}; p=${p}; Z2=${z2}; G1=${LOADS.roof[input.roof.kind]}; D2=${pv}; D1=${input.ceilingInsulationNPerM2}; Wroof'=${roof}`,
    LOADS.references,
    undefined,
    walls.map((w) => w.explain),
  )
}
