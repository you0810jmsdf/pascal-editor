import { describe, expect, test } from 'bun:test'
import { renderGlbThumbnail, thumbnailCamera } from './my-glb-thumbnail'

describe('thumbnailCamera', () => {
  test('箱の中心を見て、斜め上（右手前）から、外接球が収まる距離に置く', () => {
    const cam = thumbnailCamera([-0.3, 0, -0.2], [0.3, 0.9, 0.2])
    expect(cam).not.toBeNull()
    if (!cam) return
    expect(cam.target).toEqual([0, 0.45, 0])
    // 半径 = 対角の半分
    expect(cam.radius).toBeCloseTo(0.5 * Math.hypot(0.6, 0.9, 0.4), 6)
    // 位置は中心から distance だけ離れる
    const d = Math.hypot(
      cam.position[0] - cam.target[0],
      cam.position[1] - cam.target[1],
      cam.position[2] - cam.target[2],
    )
    expect(d).toBeCloseTo(cam.distance, 6)
    // 右手前・上（x>0, y>中心, z>0）
    expect(cam.position[0]).toBeGreaterThan(0)
    expect(cam.position[1]).toBeGreaterThan(cam.target[1])
    expect(cam.position[2]).toBeGreaterThan(0)
    // 画角 35° で球が収まる（半径 / 距離 < sin(17.5°)）
    expect(cam.radius / cam.distance).toBeLessThan(Math.sin((17.5 * Math.PI) / 180))
  })

  test('大きさが 0・非有限は null', () => {
    expect(thumbnailCamera([0, 0, 0], [0, 0, 0])).toBeNull()
    expect(thumbnailCamera([Number.NaN, 0, 0], [1, 1, 1])).toBeNull()
  })
})

describe('renderGlbThumbnail', () => {
  test('画面が無い環境（テスト）では null を返し、落ちない', async () => {
    const loader = { parseAsync: async () => ({ scene: {} }) } as never
    expect(await renderGlbThumbnail(new ArrayBuffer(8), loader)).toBeNull()
  })
})
