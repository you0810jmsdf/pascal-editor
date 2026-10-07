import { explained } from '../explain'
import { LOADS } from '../knowledge/loads'
import { REFERENCES } from '../knowledge/references'
import type { JpBuildingInput } from '../model'
import { buildingLoads, roundup } from './loads'
import { nonNegative, positive, validateBuilding } from './validation'

const references = [REFERENCES.column, REFERENCES.howtec]

/** 仕様書 §6.8。w:kN/㎡、l:mm、Fc:N/mm²、Ae:㎡。 */
export function columnMinSize(
  w: number,
  l: number,
  fc: number = LOADS.defaultFc,
  ae: number = LOADS.columnArea,
) {
  nonNegative(w, '柱負担荷重')
  positive(l, '横架材間距離')
  positive(fc, '圧縮基準強度')
  positive(ae, '柱負担面積')
  const a = Math.sqrt(((w * ae) / ((LOADS.kd / 3) * fc)) * 1000)
  const y = l / 52.7
  const z = l / 8.66
  const branch = y > a ? 'slender' : z < a ? 'short' : 'intermediate'
  const raw =
    branch === 'slender'
      ? (((12 * l ** 2) / 3000) * a ** 2) ** 0.25
      : branch === 'short'
        ? a
        : l / 75.05 + Math.sqrt((l / 75.05) ** 2 + a ** 2 / 1.3)
  const deBuckling = roundup(raw)
  const deSlenderness = roundup((Math.sqrt(12) * l) / 150)
  const de = Math.max(deBuckling, deSlenderness)
  const ratioDenominator = Math.floor((l / de) * 10) / 10
  return explained(
    {
      de,
      deBuckling,
      deSlenderness,
      a,
      l,
      w,
      fc,
      ae,
      branch,
      ratio: `1/${ratioDenominator}`,
      slenderness: (Math.sqrt(12) * l) / de,
    },
    'a=√(w·Ae/(Kd/3·Fc)·1000); y=l/52.7; z=l/8.66; y>a: d=(12l²a²/3000)^(1/4); z<a: d=a; 他: d=l/75.05+√((l/75.05)²+a²/1.3); de=max(ceil(d),ceil(√12·l/150)); de/l表示=1/(floor(l/de·10)/10)',
    `w=${w}; Ae=${ae}; Kd=${LOADS.kd}; Fc=${fc}; l=${l}; a=${a}; y=${y}; z=${z}; 分岐=${branch}; d=${raw}; 座屈=${deBuckling}; 細長比制限=${deSlenderness}; de=${de}`,
    references,
    ['隅柱は通し柱または同等の補強を要する（令43条5項）。'],
  )
}

/** 外周柱・内部柱を階別に返す。柱位置の外周判定は後続の幾何アダプタが担う。 */
export function columnSizes(input: JpBuildingInput) {
  validateBuilding(input)
  positive(input.timber.fc, '圧縮基準強度')
  const loads = buildingLoads(input)
  const { roof, walls } = loads.value
  const two = input.storeys.length === 2
  const r = two ? input.storeys[1]!.floorArea / input.storeys[0]!.floorArea : 1
  // オラクル two_storey_columns は屋根・壁にrを掛けず、下屋のみ(1-r)を保持する。
  const lean = two && r < 1 ? (1 - r) * roof : 0
  const floor = (LOADS.floor + LOADS.liveColumn[input.use]) / 1000
  const storeys = input.storeys.map((s, i) => {
    const lower = two && i === 0
    const l = s.height * 1000 - (lower ? 120 : 105)
    const outerW =
      roof + 0.5 * walls[i]!.value.total + (lower ? walls[1]!.value.total + floor + lean : 0)
    const innerW =
      roof + 0.5 * walls[i]!.value.inner + (lower ? walls[1]!.value.inner + floor + lean : 0)
    const exterior = columnMinSize(outerW, l, input.timber.fc)
    const interior = columnMinSize(innerW, l, input.timber.fc)
    const columns = s.columns?.map((c) => ({
      id: c.id,
      actualMm: c.sizeMm ? Math.min(...c.sizeMm) : undefined,
      exteriorOk: c.sizeMm ? c.sizeMm.every((size) => size >= exterior.value.de) : undefined,
      interiorOk: c.sizeMm ? c.sizeMm.every((size) => size >= interior.value.de) : undefined,
      through: c.through,
    }))
    return explained(
      { index: s.index, exterior, interior, columns },
      "l=1000h−梁せい; w外周=Wroof'+0.5Wwall当該'+(2階建1階: Wwall2'+Wfloor2'+Wlean); w内部はWwallを内壁荷重200h/2.8/1000に置換",
      `h=${s.height}; 梁せい=${lower ? 120 : 105}; l=${l}; Wroof'=${roof}; Wwall当該'=${walls[i]!.value.total}; Wwall2'=${lower ? walls[1]!.value.total : 0}; Wfloor2'=${lower ? floor : 0}; Wlean=${lower ? lean : 0}; w外周=${outerW}; w内部=${innerW}`,
      references,
      [
        '実寸比較は外周・内部の両条件を返す。柱位置による条件の選択・隅柱の同等補強の確認は別途必要。',
      ],
      [exterior.explain, interior.explain],
    )
  })
  return explained(
    { storeys },
    '各階の負担荷重と横架材間距離から外周柱・内部柱の必要小径を算出',
    `階高=${input.storeys.map((s) => s.height)}; r=${r}; Fc=${input.timber.fc}; 積載=${LOADS.liveColumn[input.use]}; 下屋=${lean}`,
    references,
    undefined,
    [loads.explain, ...storeys.map((s) => s.explain)],
  )
}
