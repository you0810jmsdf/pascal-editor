'use client'

import {
  collectKenchikuResults,
  type DocumentMeta,
  type KenchikuResults,
} from '@nsfactory/kenchiku'
import { type AnyNode, adaptJpBuilding } from '@pascal-app/core'
import { create } from 'zustand'

/**
 * 建築法規パネルの状態。計算は明示の「計算する」で行い、結果はシーンのノード参照と
 * 一緒に持つ。ノードが変われば「古い結果」とみなす（再計算は人が押す）。
 */
type KenchikuState = {
  results: KenchikuResults | null
  adapterNotes: string[]
  error: string | null
  /** 計算に使ったノード表（参照比較で古さを判定） */
  computedFor: Record<string, AnyNode> | null
  computedAt: number | null
  meta: DocumentMeta
  showBearingOverlay: boolean
  showExplain: boolean
  compute: (nodes: Record<string, AnyNode>, buildingId?: string) => KenchikuResults | null
  setMeta: (patch: Partial<DocumentMeta>) => void
  setShowBearingOverlay: (visible: boolean) => void
  setShowExplain: (visible: boolean) => void
  clear: () => void
}

const useKenchiku = create<KenchikuState>()((set) => ({
  results: null,
  adapterNotes: [],
  error: null,
  computedFor: null,
  computedAt: null,
  meta: {},
  showBearingOverlay: true,
  showExplain: false,
  compute: (nodes, buildingId) => {
    try {
      const adapted = adaptJpBuilding(nodes, buildingId)
      const results = collectKenchikuResults(adapted.value)
      set({
        results,
        adapterNotes: adapted.explain.notes ?? [],
        error: null,
        computedFor: nodes,
        computedAt: Date.now(),
      })
      return results
    } catch (error) {
      set({
        results: null,
        adapterNotes: [],
        error: error instanceof Error ? error.message : String(error),
        computedFor: nodes,
        computedAt: Date.now(),
      })
      return null
    }
  },
  setMeta: (patch) => set((state) => ({ meta: { ...state.meta, ...patch } })),
  setShowBearingOverlay: (showBearingOverlay) => set({ showBearingOverlay }),
  setShowExplain: (showExplain) => set({ showExplain }),
  clear: () =>
    set({ results: null, adapterNotes: [], error: null, computedFor: null, computedAt: null }),
}))

export default useKenchiku
