import { LOADS } from '../knowledge/loads'
import type { JpBuildingInput } from '../model'

export class KenchikuScopeError extends Error {
  readonly code = 'KENCHIKU_SCOPE'
  constructor(message: string) {
    super(message)
    this.name = 'KenchikuScopeError'
  }
}

export function nonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} は有限の非負数が必要です`)
}

export function positive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} は有限の正数が必要です`)
}

export function validateBuilding(input: JpBuildingInput): void {
  if (input.storeys.length === 0) throw new RangeError('階が必要です')
  if (input.storeys.length > 2 || input.storeys.some((s) => s.index > 2)) {
    throw new KenchikuScopeError('3階以上はフェーズAの対象外です')
  }
  for (const [i, storey] of input.storeys.entries()) {
    if (storey.index !== i + 1) throw new RangeError('階は1階から昇順で指定してください')
    positive(storey.floorArea, '床面積')
    positive(storey.height, '階高')
    if (storey.height * 1000 <= (input.storeys.length === 2 && i === 0 ? 120 : 105)) {
      throw new KenchikuScopeError('階高が横架材の梁せい以下です')
    }
  }
  nonNegative(input.roof.rise, '屋根高さ')
  nonNegative(input.roof.overhang, '軒の出')
  nonNegative(input.roof.pitchSun, '屋根勾配')
  const area = input.storeys.reduce((sum, s) => sum + s.floorArea, 0)
  const height =
    input.storeys.reduce((sum, s) => sum + s.height, 0) + input.roof.rise + LOADS.baseHeight
  if (area > 300) throw new KenchikuScopeError('延べ面積300㎡超はフェーズAの対象外です')
  if (height > 16) throw new KenchikuScopeError('最高高さ16m超はフェーズAの対象外です')
  // TODO(spec §6.2): 「階高が極端」の数値境界が未定義。梁せい以下と最高高さ16m超のみ拒否する。
  if (input.c0 !== 0.2 && input.c0 !== 0.3) throw new RangeError('C0 は0.2または0.3が必要です')
  nonNegative(input.ceilingInsulationNPerM2, '天井断熱荷重')
  nonNegative(input.wallInsulationNPerM2, '外壁断熱荷重')
  if (input.pv.kind === 'custom') positiveOrZeroPv(input.pv.loadNPerM2)
  if (input.snow) {
    nonNegative(input.snow.depthCm, '積雪深')
    nonNegative(input.snow.unitNPerM2PerCm, '積雪単位荷重')
  }
}

function positiveOrZeroPv(value: number | undefined): void {
  if (value === undefined) throw new RangeError('任意の太陽光荷重が未入力です')
  nonNegative(value, '太陽光荷重')
}
