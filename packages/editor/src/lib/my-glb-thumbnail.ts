/**
 * N's factory: 読み込んだ GLB を一度だけ描画して、カタログ用のサムネイル画像（PNG）を作る。
 * 画面の 3D（WebGPU）とは別に、小さな WebGL で斜め上から1枚だけ描く。失敗したら null を返し、
 * 呼び出し側は名前の頭文字の簡易画像のままにする（登録は止めない）。
 */
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  type Mesh,
  type Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Vec3 } from './my-glb-fit'

export const THUMB_SIZE = 160
const FOV_DEG = 35
/** 斜め上（右手前）から見る向き */
const VIEW_DIR: Vec3 = [1, 0.75, 1]

export type ThumbCamera = { position: Vec3; target: Vec3; distance: number; radius: number }

/** 外接箱がちょうど収まる位置にカメラを置く（純粋な計算） */
export function thumbnailCamera(min: Vec3, max: Vec3): ThumbCamera | null {
  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  const radius = 0.5 * Math.hypot(size[0], size[1], size[2])
  if (!Number.isFinite(radius) || radius <= 0) return null
  const target: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const distance = (radius / Math.sin((FOV_DEG * Math.PI) / 360)) * 1.05
  const len = Math.hypot(...VIEW_DIR)
  const position: Vec3 = [
    target[0] + (VIEW_DIR[0] / len) * distance,
    target[1] + (VIEW_DIR[1] / len) * distance,
    target[2] + (VIEW_DIR[2] / len) * distance,
  ]
  return { position, target, distance, radius }
}

function disposeObject(root: Object3D) {
  root.traverse((obj) => {
    const mesh = obj as Mesh
    mesh.geometry?.dispose?.()
    const material = mesh.material
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      for (const value of Object.values(m)) {
        if (value && typeof (value as { dispose?: unknown }).dispose === 'function') {
          ;(value as { dispose: () => void }).dispose()
        }
      }
      m.dispose()
    }
  })
}

/** GLB（ArrayBuffer）から PNG のサムネイルを作る。WebGL が使えないなど、失敗したら null。 */
export async function renderGlbThumbnail(
  buffer: ArrayBuffer,
  loader: GLTFLoader,
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  let renderer: WebGLRenderer | null = null
  let model: Object3D | null = null
  try {
    const gltf = await loader.parseAsync(buffer, '')
    model = gltf.scene
    model.updateMatrixWorld(true)
    const box = new Box3().setFromObject(model)
    if (box.isEmpty()) return null
    const cam = thumbnailCamera(
      [box.min.x, box.min.y, box.min.z],
      [box.max.x, box.max.y, box.max.z],
    )
    if (!cam) return null

    const canvas = document.createElement('canvas')
    canvas.width = THUMB_SIZE
    canvas.height = THUMB_SIZE
    renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    renderer.setSize(THUMB_SIZE, THUMB_SIZE, false)
    renderer.setClearColor(0x3f3f46, 1)

    const scene = new Scene()
    scene.add(model)
    scene.add(new AmbientLight(0xffffff, 1.6))
    const sun = new DirectionalLight(0xffffff, 2.2)
    sun.position.set(cam.position[0] + 1, cam.position[1] + 2, cam.position[2] - 1)
    scene.add(sun)

    const camera = new PerspectiveCamera(FOV_DEG, 1, cam.distance * 0.05, cam.distance * 4)
    camera.position.set(...cam.position)
    camera.lookAt(new Vector3(...cam.target))
    renderer.render(scene, camera)

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    )
  } catch {
    return null
  } finally {
    if (model) disposeObject(model)
    renderer?.dispose()
  }
}
