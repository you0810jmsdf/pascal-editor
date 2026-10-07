'use client'

import { type AnyNode, findJpBuilding, jpStoreyLevels, rot2, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { memo, useMemo } from 'react'
import useKenchiku from '../../../store/use-kenchiku'

/**
 * 平面図に耐力壁の有効区間を色で重ねる（青＝X方向、緑＝Y方向、灰色の破線＝準耐力壁等）。
 * 建築法規パネルで「計算する」を押した結果を、表示中の階について描く。モデルが変わって
 * 結果が古いときは薄くする。平面図のシーン `<g>` の中に置くので座標は壁と同じ（m）。
 */
export const FloorplanKenchikuLayer = memo(function FloorplanKenchikuLayer() {
  const show = useKenchiku((s) => s.showBearingOverlay)
  const results = useKenchiku((s) => s.results)
  const computedFor = useKenchiku((s) => s.computedFor)
  const nodes = useScene((s) => s.nodes) as Record<string, AnyNode>
  const levelId = useViewer((s) => s.selection.levelId)

  const segments = useMemo(() => {
    if (!show || !results || !levelId || !computedFor) return []
    try {
      const building = findJpBuilding(computedFor)
      const levels = jpStoreyLevels(computedFor, building)
      const index = levels.findIndex((l) => l.id === levelId)
      if (index < 0) return []
      // エンジンは壁の主方向を X 軸に合わせて回した座標で計算する。図面に戻すときは逆回転。
      const back = -(results.input.axisRotation ?? 0)
      return (results.walls.value.storeys[index]?.value.segments ?? []).map((s) => ({
        ...s.value,
        start: rot2(s.value.start, back),
        end: rot2(s.value.end, back),
      }))
    } catch {
      return []
    }
  }, [show, results, levelId, computedFor])

  if (!segments.length) return null
  const stale = computedFor !== nodes
  return (
    <g className="floorplan-kenchiku-layer" opacity={stale ? 0.35 : 0.9} pointerEvents="none">
      {segments.map((s, i) => (
        <line
          key={`${s.wallId}-${i}`}
          stroke={s.quasi ? '#8a8f98' : s.direction === 'x' ? '#1a4f8b' : '#2e7d32'}
          strokeDasharray={s.quasi ? '6 4' : undefined}
          strokeLinecap="butt"
          strokeWidth={5}
          vectorEffect="non-scaling-stroke"
          x1={s.start[0]}
          x2={s.end[0]}
          y1={s.start[1]}
          y2={s.end[1]}
        />
      ))}
    </g>
  )
})
