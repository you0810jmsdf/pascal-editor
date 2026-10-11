import { describe, expect, test } from 'bun:test'
import { isMyItemId, planMyItemRefresh } from './my-items-rehydrate'

const current = new Map([['my-1', { src: 'blob:new', thumbnail: 'blob:thumb-new' }]])

const itemNode = (id: string, assetId: string, src: string, thumbnail = 'blob:thumb-old') => ({
  id,
  type: 'item',
  asset: { id: assetId, src, thumbnail, dimensions: [1, 1, 1] },
})

describe('isMyItemId', () => {
  test('"my-" で始まる文字列だけ', () => {
    expect(isMyItemId('my-abc')).toBe(true)
    expect(isMyItemId('cactus')).toBe(false)
    expect(isMyItemId(undefined)).toBe(false)
  })
})

describe('planMyItemRefresh', () => {
  test('古い blob URL のマイ素材ノードだけ、最新の URL に差し替える（他の asset の項目は保つ）', () => {
    const nodes = {
      a: itemNode('a', 'my-1', 'blob:old'),
      b: itemNode('b', 'cactus', 'https://example/cactus.glb'),
      c: { id: 'c', type: 'wall' },
    }
    const plan = planMyItemRefresh(nodes, current)
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({
      nodeId: 'a',
      asset: { id: 'my-1', src: 'blob:new', thumbnail: 'blob:thumb-new' },
    })
    expect((plan[0]!.asset as { dimensions: number[] }).dimensions).toEqual([1, 1, 1])
  })

  test('すでに最新なら空（再実行しても止まる）', () => {
    const nodes = { a: itemNode('a', 'my-1', 'blob:new', 'blob:thumb-new') }
    expect(planMyItemRefresh(nodes, current)).toEqual([])
  })

  test('保存領域に無い素材（削除済み）は触らない', () => {
    const nodes = { a: itemNode('a', 'my-gone', 'blob:old') }
    expect(planMyItemRefresh(nodes, current)).toEqual([])
  })

  test('壊れたノードでも落ちない', () => {
    const nodes = { a: null, b: { type: 'item' }, c: 5 } as Record<string, unknown>
    expect(planMyItemRefresh(nodes, current)).toEqual([])
  })
})
