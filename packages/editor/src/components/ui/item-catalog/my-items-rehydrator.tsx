'use client'

/**
 * N's factory: 起動時（と、シーンを読み込んだとき）に、マイ素材を使っている家具の `src` を
 * このセッションで有効な URL に直す。画面には何も出さない。変更は元に戻す履歴には残さない。
 */
import {
  type AnyNode,
  type AnyNodeId,
  beginSceneHistoryPauseSession,
  useScene,
} from '@pascal-app/core'
import { useEffect } from 'react'
import { loadMyCatalogItems } from '../../../lib/my-items-runtime'
import { type MyItemUrls, planMyItemRefresh } from '../../../lib/my-items-rehydrate'

export function MyItemsRehydrator() {
  useEffect(() => {
    let cancelled = false
    let current = new Map<string, MyItemUrls>()

    const apply = () => {
      if (current.size === 0) return
      const plan = planMyItemRefresh(useScene.getState().nodes as Record<string, unknown>, current)
      if (plan.length === 0) return
      const pause = beginSceneHistoryPauseSession(useScene)
      try {
        for (const item of plan) {
          useScene
            .getState()
            .updateNode(item.nodeId as AnyNodeId, { asset: item.asset } as Partial<AnyNode>)
        }
      } finally {
        pause.end()
      }
    }

    loadMyCatalogItems()
      .then((items) => {
        if (cancelled) return
        current = new Map(items.map((i) => [i.id, { src: i.src, thumbnail: i.thumbnail }]))
        apply()
      })
      .catch(() => {
        // 保存領域が使えない環境では、何もしない（マイ素材なしで動く）
      })

    // シーンが（あとから）読み込まれたときにも直す。直したあとは計画が空になるので止まる。
    const unsubscribe = useScene.subscribe(() => apply())
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return null
}
