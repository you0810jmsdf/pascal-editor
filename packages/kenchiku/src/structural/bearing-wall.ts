import { type Explained, explained } from '../explain'
import { BEARING_RATIOS, BEARING_RULES } from '../knowledge/bearing-ratios'
import type { Dir, JpBearingSpec, JpBuildingInput, JpStorey, JpWall, Pt } from '../model'
import { distance, EPS } from './polygon'
import { nonNegative, positive, validateBuilding } from './validation'

const refs = BEARING_RULES.references

export function bearingComponents(spec: JpBearingSpec): JpBearingSpec[] {
  if (spec.kind !== 'combined') return [spec]
  if (!spec.components?.length) throw new RangeError('併用する軸組の仕様が必要です')
  if (spec.components.some((s) => s.kind === 'combined' || s.quasi))
    throw new RangeError('併用の子要素は単独の耐力壁仕様を指定してください')
  return spec.components
}

export function memberDistance(input: JpBuildingInput, storey: JpStorey): number {
  const ho =
    storey.horizontalMemberDistance ??
    storey.height - (input.storeys.length === 2 && storey.index === 1 ? 0.12 : 0.105)
  positive(ho, '横架材上端間距離')
  return ho
}

export function bearingRatio(spec: JpBearingSpec, length: number, ho: number) {
  positive(length, '区間長さ')
  positive(ho, '横架材上端間距離')
  const parts = bearingComponents(spec).map((s) => {
    const base = BEARING_RATIOS[s.kind] ?? s.ratioOverride
    if (base === undefined) throw new RangeError(`${s.kind} の倍率が未入力です`)
    nonNegative(base, '壁倍率')
    const ld = s.braceLengthMm === undefined ? length : s.braceLengthMm / 1000
    positive(ld, '筋かい幅')
    const alphaH =
      s.kind.startsWith('brace-') && ho > BEARING_RULES.braceHeightThreshold
        ? Math.min(1, (BEARING_RULES.braceHeightFactor * ld) / ho)
        : 1
    const faces = !spec.quasi && s.kind.startsWith('panel-') && s.faces === 'both' ? 2 : 1
    return { kind: s.kind, base, alphaH, faces, ratio: base * alphaH * faces }
  })
  const sum = parts.reduce((total, p) => total + p.ratio, 0)
  const limit = parts.some((p) => p.kind === 'brace-90x90-x') ? 5 : 7
  const ratio = Math.min(sum, limit)
  return explained(
    { ratio, parts, limit },
    '倍率=min(Σ(基準倍率×αh×面数), 上限); αh=Ho>3.2の筋かいのみmin(1,3.5Ld/Ho)',
    `Ho=${ho}; 長さ=${length}; 各仕様=${JSON.stringify(parts)}; min(${sum},${limit})=${ratio}`,
    refs,
  )
}

export interface BearingSegment {
  wallId: string
  direction: Dir
  start: Pt
  end: Pt
  length: number
  ratio: number
  wallCm: number
  quasi: boolean
  spec: JpBearingSpec
}

function directionOf(wall: JpWall): Dir | null {
  const dx = Math.abs(wall.end[0] - wall.start[0])
  const dy = Math.abs(wall.end[1] - wall.start[1])
  if (dy <= dx * Math.tan(Math.PI / 8) + EPS) return 'x'
  if (dx <= dy * Math.tan(Math.PI / 8) + EPS) return 'y'
  return null
}

function solidIntervals(wall: JpWall, length: number): [number, number][] {
  const openings = wall.openings
    .map((o) => {
      if (!Number.isFinite(o.u)) throw new RangeError('開口位置は有限値が必要です')
      nonNegative(o.width, '開口幅')
      return [Math.max(0, o.u - o.width / 2), Math.min(length, o.u + o.width / 2)] as const
    })
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0])
  const solid: [number, number][] = []
  let cursor = 0
  for (const [a, b] of openings) {
    if (a > cursor) solid.push([cursor, a])
    cursor = Math.max(cursor, b)
  }
  if (cursor < length) solid.push([cursor, length])
  return solid
}

export function wallSegments(wall: JpWall, minLength: number, ho: number, quasiWalls = false) {
  positive(minLength, '耐力壁の最小長さ')
  if ([...wall.start, ...wall.end].some((v) => !Number.isFinite(v)))
    throw new RangeError('壁座標は有限値が必要です')
  const length = distance(wall.start, wall.end)
  const direction = length > EPS ? directionOf(wall) : null
  const excluded = wall.curveOffset ? 'curved' : !direction ? 'diagonal' : null
  const solid = solidIntervals(wall, length)
  const openingLength = length - solid.reduce((sum, [a, b]) => sum + b - a, 0)
  const notes: string[] = []
  const segments: Explained<BearingSegment>[] = []
  if (!excluded && direction && wall.bearing && wall.bearing.kind !== 'none') {
    const spec = wall.bearing
    for (const [a, b] of solid) {
      if (b - a + EPS < minLength || (spec.quasi && (!quasiWalls || b - a + EPS < 0.9))) continue
      const result = bearingRatio(spec, b - a, ho)
      let ratio = result.value.ratio
      if (spec.quasi) {
        const q = spec.quasi
        if (
          !Number.isFinite(q.panelHeightRatio) ||
          q.panelHeightRatio < 0 ||
          q.panelHeightRatio > 1
        )
          throw new RangeError('準耐力壁の高さ比は0〜1が必要です')
        if (q.position && q.position !== 'full') {
          if (q.clearHeight === undefined) {
            notes.push('垂れ壁・腰壁の内法高さが未入力のため集計外')
            continue
          }
          positive(q.clearHeight, '横架材内法')
          if (b - a > 2 + EPS || q.panelHeightRatio * q.clearHeight + EPS < 0.36) continue
        }
        const base = q.kind === 'lath' ? 0.5 : 0.6 * ratio
        ratio = Math.min(1.5, base * q.panelHeightRatio) * (spec.faces === 'both' ? 2 : 1)
      }
      const point = (u: number): Pt => [
        wall.start[0] + ((wall.end[0] - wall.start[0]) * u) / length,
        wall.start[1] + ((wall.end[1] - wall.start[1]) * u) / length,
      ]
      const value: BearingSegment = {
        wallId: wall.id,
        direction,
        start: point(a),
        end: point(b),
        length: b - a,
        ratio,
        wallCm: (b - a) * 100 * ratio,
        quasi: !!spec.quasi,
        spec,
      }
      segments.push(
        explained(
          value,
          '壁量=区間長さ(m)×100×倍率; 準耐力壁倍率=min(1.5,係数×基準倍率×高さ比)×面数',
          `${a}〜${b}m; ${b - a}×100×${ratio}=${value.wallCm}cm; 準耐力壁=${JSON.stringify(spec.quasi)}; 面数=${spec.faces ?? 'one'}`,
          refs,
          undefined,
          [result.explain],
        ),
      )
    }
  }
  return explained(
    {
      wallId: wall.id,
      direction,
      length,
      openingLength,
      effectiveLength: segments.reduce((sum, s) => sum + s.value.length, 0),
      excluded,
      segments,
    },
    '有効区間=壁区間−開口区間の和集合; 長さ≥最小長さ; 方向許容±22.5°',
    `壁=${wall.id}; 全長=${length}; 開口合計=${openingLength}; 最小長さ=${minLength}; 集計外=${excluded ?? 'なし'}`,
    refs,
    notes,
    segments.map((s) => s.explain),
  )
}

export function bearingWalls(input: JpBuildingInput) {
  validateBuilding(input)
  const storeys = input.storeys.map((storey) => {
    const ho = memberDistance(input, storey)
    const walls = storey.walls.map((w) =>
      wallSegments(w, input.minBearingLength, ho, input.quasiWalls),
    )
    const candidates = walls.flatMap((w) => w.value.segments)
    const full = candidates.filter((s) => !s.value.quasi && s.value.ratio > 0)
    const segments = candidates.filter((s) => {
      const q = s.value.spec.quasi
      if (!q?.position || q.position === 'full') return true
      const attached = (p: Pt) =>
        full.some(
          (f) =>
            f.value.direction === s.value.direction &&
            [f.value.start, f.value.end].some((e) => distance(p, e) <= EPS),
        )
      return attached(s.value.start) && attached(s.value.end)
    })
    const excluded = {
      curved: walls.filter((w) => w.value.excluded === 'curved').length,
      diagonal: walls.filter((w) => w.value.excluded === 'diagonal').length,
      unsupportedQuasi: candidates.length - segments.length,
    }
    return explained(
      { storey: storey.index, ho, walls, segments, excluded },
      '各壁の有効区間を集計; 垂れ壁・腰壁は両端に耐力壁',
      `階=${storey.index}; Ho=${ho}; 曲面=${excluded.curved}; 斜め=${excluded.diagonal}; 両側耐力壁なし=${excluded.unsupportedQuasi}`,
      refs,
      storey.horizontalMemberDistance === undefined
        ? ['Hoは§6.8の梁せい（1階120mm、最上階105mm）を階高から控除して近似。']
        : [],
      walls.map((w) => w.explain),
    )
  })
  return explained(
    { storeys },
    '各階の耐力壁区間・準耐力壁区間',
    `階数=${storeys.length}`,
    refs,
    undefined,
    storeys.map((s) => s.explain),
  )
}
