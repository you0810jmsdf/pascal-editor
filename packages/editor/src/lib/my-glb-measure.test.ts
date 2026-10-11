import { describe, expect, test } from 'bun:test'
import { looksLikeGlb, MY_GLB_MAX_BYTES, measureGlb } from './my-glb-measure'

/** 最小の GLB（POSITION だけを持つ三角形2枚＝直方体の外形を決める 8 頂点）を手で組む */
function makeBoxGlb(min: [number, number, number], max: [number, number, number]): ArrayBuffer {
  const [x0, y0, z0] = min
  const [x1, y1, z1] = max
  const positions = new Float32Array([
    x0,
    y0,
    z0,
    x1,
    y0,
    z0,
    x1,
    y1,
    z0,
    x0,
    y1,
    z0,
    x0,
    y0,
    z1,
    x1,
    y0,
    z1,
    x1,
    y1,
    z1,
    x0,
    y1,
    z1,
  ])
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
  const bin = new Uint8Array(positions.byteLength + indices.byteLength)
  bin.set(new Uint8Array(positions.buffer), 0)
  bin.set(new Uint8Array(indices.buffer), positions.byteLength)

  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
    ],
    buffers: [{ byteLength: bin.byteLength }],
  }
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4
  const jsonPadded = new Uint8Array(jsonBytes.length + jsonPad).fill(0x20)
  jsonPadded.set(jsonBytes)
  const binPad = (4 - (bin.length % 4)) % 4
  const binPadded = new Uint8Array(bin.length + binPad)
  binPadded.set(bin)

  const total = 12 + 8 + jsonPadded.length + 8 + binPadded.length
  const out = new ArrayBuffer(total)
  const view = new DataView(out)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonPadded.length, true)
  view.setUint32(16, 0x4e4f534a, true) // JSON
  new Uint8Array(out, 20, jsonPadded.length).set(jsonPadded)
  const binHead = 20 + jsonPadded.length
  view.setUint32(binHead, binPadded.length, true)
  view.setUint32(binHead + 4, 0x004e4942, true) // BIN
  new Uint8Array(out, binHead + 8, binPadded.length).set(binPadded)
  return out
}

describe('looksLikeGlb', () => {
  test('GLB の先頭を見分ける', () => {
    expect(looksLikeGlb(makeBoxGlb([0, 0, 0], [1, 1, 1]))).toBe(true)
    expect(looksLikeGlb(new TextEncoder().encode('{"asset":{}} 000').buffer as ArrayBuffer)).toBe(
      false,
    )
    expect(looksLikeGlb(new ArrayBuffer(4))).toBe(false)
  })
})

describe('measureGlb', () => {
  test('メートル単位の箱: 幅0.6・高0.9・奥0.4 が実測どおり出る', async () => {
    const r = await measureGlb(makeBoxGlb([0.2, 0.1, -0.3], [0.8, 1.0, 0.1]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fit.unit).toBe('m')
    expect(r.fit.dimensions[0]).toBeCloseTo(0.6, 4)
    expect(r.fit.dimensions[1]).toBeCloseTo(0.9, 4)
    expect(r.fit.dimensions[2]).toBeCloseTo(0.4, 4)
    // 中心 x=0.5・z=-0.1、底 y=0.1 を原点へ
    expect(r.fit.offset[0]).toBeCloseTo(-0.5, 4)
    expect(r.fit.offset[1]).toBeCloseTo(-0.1, 4)
    expect(r.fit.offset[2]).toBeCloseTo(0.1, 4)
  })

  test('センチ単位の箱は 0.01 倍で提案される', async () => {
    const r = await measureGlb(makeBoxGlb([-30, 0, -20], [30, 90, 20]))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.fit.unit).toBe('cm')
    expect(r.fit.dimensions[1]).toBeCloseTo(0.9, 4)
  })

  test('GLB でないものは not-glb、大きすぎるものは too-large', async () => {
    const text = new TextEncoder().encode('これは GLB ではありません。これは GLB ではありません。')
      .buffer as ArrayBuffer
    expect(await measureGlb(text)).toMatchObject({ ok: false, problem: 'not-glb' })
    const big = new ArrayBuffer(MY_GLB_MAX_BYTES + 1)
    expect(await measureGlb(big)).toMatchObject({ ok: false, problem: 'too-large' })
  })

  test('壊れた GLB は parse（落ちない）', async () => {
    const good = makeBoxGlb([0, 0, 0], [1, 1, 1])
    const broken = good.slice(0, 40)
    expect(await measureGlb(broken)).toMatchObject({ ok: false, problem: 'parse' })
  })
})
