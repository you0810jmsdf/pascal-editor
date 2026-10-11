import { describe, expect, test } from 'bun:test'
import { toAssetInput } from './my-items-runtime'
import type { MyItemMeta } from './my-items-store'

const meta = (over: Partial<MyItemMeta> = {}): MyItemMeta => ({
  id: 'my-1',
  name: '自作の椅子',
  category: 'furniture',
  dimensions: [0.5, 0.9, 0.5],
  offset: [0, 0.1, 0],
  rotation: [0, 0, 0],
  scale: [0.01, 0.01, 0.01],
  thumbnail: '',
  createdAt: '2026-10-11T00:00:00.000Z',
  size: 123,
  ...over,
})

const urls = { src: 'blob:model', thumbnail: 'blob:thumb' }

describe('toAssetInput', () => {
  test('床置きは tags に floor、attachTo なし。src・thumbnail は blob URL', () => {
    const a = toAssetInput(meta(), urls)
    expect(a).toMatchObject({
      id: 'my-1',
      source: 'mine',
      src: 'blob:model',
      thumbnail: 'blob:thumb',
      dimensions: [0.5, 0.9, 0.5],
      offset: [0, 0.1, 0],
      scale: [0.01, 0.01, 0.01],
    })
    expect(a.tags).toEqual(['mine', 'floor'])
    expect('attachTo' in a).toBe(false)
  })

  test('壁・天井は attachTo と tags が付く', () => {
    expect(toAssetInput(meta({ attachTo: 'wall' }), urls)).toMatchObject({
      attachTo: 'wall',
      tags: ['mine', 'wall'],
    })
    expect(toAssetInput(meta({ attachTo: 'ceiling' }), urls)).toMatchObject({
      attachTo: 'ceiling',
      tags: ['mine', 'ceiling'],
    })
  })

  test('保存済みサムネイルがあればそれを優先する', () => {
    expect(toAssetInput(meta({ thumbnail: 'blob:saved' }), urls).thumbnail).toBe('blob:saved')
  })
})
