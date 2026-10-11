/**
 * N's factory: 利用者が自分で読み込む GLB 家具の「寸法・底面位置・単位」を、
 * モデルの外接箱（バウンディングボックス）から算出する純粋関数。画面・three に依存しない。
 *
 * 家具の原点は「足元の中心」。asset.offset は、モデルの外接箱の底面中心を原点へ寄せる補正値
 * （カタログの cactus の offset x=-0.0039 と同じ考え方）。
 */

export type Vec3 = [number, number, number]

export type GlbFit = {
  /** 幅・高さ・奥行（m）。倍率を掛けたあとの値 */
  dimensions: Vec3
  /** asset.offset（倍率を掛けたあとの座標で、底面中心を原点へ寄せる） */
  offset: Vec3
  /** asset.scale（一様倍率） */
  scale: Vec3
  /** 推定した単位。'm' 以外のときは倍率を自動で提案している */
  unit: 'm' | 'cm' | 'mm'
}

export type GlbFitProblem = 'empty' | 'not-finite' | 'flat'

export type GlbFitResult = { ok: true; fit: GlbFit } | { ok: false; problem: GlbFitProblem }

/** 長辺（外接箱の最大寸法）から単位を推定する。家具は 10m 以下ならメートル、500 超ならミリ、その間はセンチ */
export function guessUnit(maxDim: number): GlbFit['unit'] {
  if (maxDim <= 10) return 'm'
  if (maxDim <= 500) return 'cm'
  return 'mm'
}

const UNIT_SCALE: Record<GlbFit['unit'], number> = { m: 1, cm: 0.01, mm: 0.001 }

const round = (value: number, digits = 4) => {
  const f = 10 ** digits
  // -0 を 0 にする
  return Math.round(value * f) / f + 0
}

/**
 * @param min 外接箱の最小点（モデル座標）
 * @param max 外接箱の最大点
 * @param unitOverride 利用者が単位を直したとき（確認カード）に指定する
 */
export function fitFromBounds(min: Vec3, max: Vec3, unitOverride?: GlbFit['unit']): GlbFitResult {
  const all = [...min, ...max]
  if (all.some((v) => !Number.isFinite(v))) return { ok: false, problem: 'not-finite' }

  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  const maxDim = Math.max(size[0], size[1], size[2])
  if (size.some((v) => v < 0) || maxDim <= 0) return { ok: false, problem: 'empty' }
  // 平らな板（どれかの軸が極端に薄い）は家具として置けないので、呼び出し側に知らせる
  if (Math.min(size[0], size[1], size[2]) <= maxDim * 1e-6) return { ok: false, problem: 'flat' }

  const unit = unitOverride ?? guessUnit(maxDim)
  const k = UNIT_SCALE[unit]

  const dimensions: Vec3 = [round(size[0] * k), round(size[1] * k), round(size[2] * k)]
  const centerX = (min[0] + max[0]) / 2
  const centerZ = (min[2] + max[2]) / 2
  const offset: Vec3 = [round(-centerX * k), round(-min[1] * k), round(-centerZ * k)]

  return { ok: true, fit: { dimensions, offset, scale: [k, k, k], unit } }
}
