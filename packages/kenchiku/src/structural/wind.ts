import { explained } from '../explain'
import { WIND } from '../knowledge/loads'
import type { Dir, FacadeArea, JpBuildingInput, Pt } from '../model'
import { nonNegative, validateBuilding } from './validation'

function validateCoefficient(coefficient: number): void {
  if (
    !Number.isFinite(coefficient) ||
    coefficient < WIND.defaultCoefficient ||
    coefficient > WIND.maxCoefficient
  ) {
    throw new RangeError('風係数は50〜75 cm/㎡が必要です')
  }
}

/** 見付面積は床+1.35m以下を控除済みの値（㎡）。 */
export function requiredWind(area: number, coefficient: number = WIND.defaultCoefficient) {
  nonNegative(area, '見付面積')
  validateCoefficient(coefficient)
  return explained(
    area * coefficient,
    '必要壁量(cm)=風係数(cm/㎡)×見付面積(㎡)',
    `${coefficient}×${area}=${coefficient * area}cm`,
    WIND.references,
  )
}

function width(polygon: Pt[], direction: Dir): number {
  if (polygon.length < 3) throw new RangeError('見付面積の近似には床外周ポリゴンが必要です')
  const axis = direction === 'x' ? 1 : 0
  const values = polygon.map((p) => p[axis])
  if (values.some((v) => !Number.isFinite(v))) throw new RangeError('床外周座標は有限値が必要です')
  return Math.max(...values) - Math.min(...values)
}

function areaAbove(polygon: Pt[], cut: number): number {
  if (polygon.length < 3 || polygon.some((p) => p.some((v) => !Number.isFinite(v)))) {
    throw new RangeError('屋根シルエットには有限座標の多角形が必要です')
  }
  const clipped: Pt[] = []
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    if (a[1] >= cut) clipped.push(a)
    if (a[1] >= cut !== b[1] >= cut)
      clipped.push([a[0] + ((b[0] - a[0]) * (cut - a[1])) / (b[1] - a[1]), cut])
  }
  return (
    Math.abs(
      clipped.reduce((sum, p, i) => {
        const q = clipped[(i + 1) % clipped.length]!
        return sum + p[0] * q[1] - q[0] * p[1]
      }, 0),
    ) / 2
  )
}

function approximateFacade(input: JpBuildingInput, index: number, direction: Dir): FacadeArea {
  const floors = input.storeys.map((_, i) =>
    input.storeys.slice(0, i).reduce((sum, s) => sum + s.height, 0),
  )
  const cut = floors[index]! + WIND.excludedHeight
  const parts: FacadeArea['parts'] = input.storeys.slice(index).map((s, offset) => {
    const bottom = floors[index + offset]!
    const height = Math.max(0, bottom + s.height - Math.max(bottom, cut))
    const span = width(s.floorPolygon, direction)
    return { label: `${s.index}階壁`, width: span, height, area: span * height }
  })
  const eave = input.storeys.reduce((sum, s) => sum + s.height, 0)
  const span = width(input.storeys.at(-1)!.floorPolygon, direction) + 2 * input.roof.overhang
  const roofHeight = input.roof.rise || 0.15
  const silhouette = input.roof.silhouette?.[direction]
  const shape: Pt[] =
    silhouette ??
    (input.roof.rise > 0
      ? [
          [0, 0],
          [span / 2, roofHeight],
          [span, 0],
        ]
      : [
          [0, 0],
          [span, 0],
          [span, roofHeight],
          [0, roofHeight],
        ])
  const roofArea = areaAbove(shape, cut - eave)
  parts.push({ label: '屋根', width: span, height: roofHeight, area: roofArea })
  return {
    storey: input.storeys[index]!.index,
    area: parts.reduce((sum, part) => sum + part.area, 0),
    parts,
    notes: [
      '壁は各階床外周のbbox幅で近似。X方向はY方向の幅、Y方向はX方向の幅を用いる。',
      silhouette
        ? '屋根は入力シルエット（縦座標は軒高を0mとする）を切断して求積。'
        : input.roof.rise > 0
          ? '屋根形状未指定のため切妻三角形で近似。寄棟・複雑な屋根はfacadeで見付面積を指定する。'
          : '陸屋根は高さ0.15mの帯で近似。',
    ],
  }
}

/** 仕様書 §6.3。入力済みの見付面積を優先し、無ければbboxから近似する。 */
export function windWall(input: JpBuildingInput) {
  validateBuilding(input)
  validateCoefficient(input.windCoef)
  const rows = input.storeys.flatMap((s, i) =>
    (['x', 'y'] as const).map((direction) => {
      const candidates = input.facade?.[direction].filter((f) => f.storey === s.index)
      if (input.facade && candidates?.length !== 1)
        throw new RangeError(`${s.index}階${direction}方向の見付面積を1件指定してください`)
      const facade = candidates?.[0] ?? approximateFacade(input, i, direction)
      for (const part of facade.parts) nonNegative(part.area, '見付面積内訳')
      const result = requiredWind(facade.area, input.windCoef)
      return explained(
        { storey: s.index, direction, requiredCm: result.value, facade },
        result.explain.formula,
        `${result.explain.substituted}; 内訳=${facade.parts.map((part) => `${part.label}:${part.area}㎡`).join(', ')}`,
        WIND.references,
        facade.notes,
      )
    }),
  )
  return explained(
    { rows },
    '各階・各方向の必要壁量=風係数×床面+1.35mより上の見付面積',
    `風係数=${input.windCoef}; 控除高さ=${WIND.excludedHeight}m`,
    WIND.references,
    undefined,
    rows.map((row) => row.explain),
  )
}
