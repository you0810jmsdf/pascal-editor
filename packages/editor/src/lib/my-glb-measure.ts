import { Box3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { fitFromBounds, type GlbFit, type GlbFitProblem, type Vec3 } from './my-glb-fit'

/** 1ファイルの上限（バイト）。ブラウザ内の IndexedDB に置くので、大きすぎるものは登録させない */
export const MY_GLB_MAX_BYTES = 20 * 1024 * 1024

export type MyGlbProblem = GlbFitProblem | 'too-large' | 'not-glb' | 'parse'

export type MyGlbMeasure =
  | { ok: true; fit: GlbFit; bounds: { min: Vec3; max: Vec3 } }
  | { ok: false; problem: MyGlbProblem; message: string }

const MESSAGES: Record<MyGlbProblem, string> = {
  'too-large': 'ファイルが大きすぎます（上限 20MB）。軽量版（Draco 圧縮など）を使ってください。',
  'not-glb': 'GLB ファイルではありません。拡張子が .glb のファイルを選んでください。',
  parse: 'モデルを読めませんでした。圧縮方式（KTX2 など）が未対応の可能性があります。',
  empty: 'モデルの中に形（メッシュ）がありません。',
  'not-finite': 'モデルの大きさが正しく計算できません。',
  flat: 'モデルが平らな板です。家具として置けません。',
}

const fail = (problem: MyGlbProblem): MyGlbMeasure => ({
  ok: false,
  problem,
  message: MESSAGES[problem],
})

/** GLB の先頭4バイトは ASCII の "glTF"（0x46546C67 リトルエンディアン） */
export function looksLikeGlb(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false
  return new DataView(buffer).getUint32(0, true) === 0x46546c67
}

/**
 * GLB を読み、外接箱から寸法・offset・単位を算出する（画面なし）。
 * @param loader Draco/KTX2 を設定済みの GLTFLoader を渡せる（省略時は素の GLTFLoader）
 */
export async function measureGlb(
  buffer: ArrayBuffer,
  loader: GLTFLoader = new GLTFLoader(),
): Promise<MyGlbMeasure> {
  if (buffer.byteLength > MY_GLB_MAX_BYTES) return fail('too-large')
  if (!looksLikeGlb(buffer)) return fail('not-glb')

  let box: Box3
  try {
    const gltf = await loader.parseAsync(buffer, '')
    gltf.scene.updateMatrixWorld(true)
    box = new Box3().setFromObject(gltf.scene)
  } catch {
    return fail('parse')
  }
  if (box.isEmpty()) return fail('empty')

  const min: Vec3 = [box.min.x, box.min.y, box.min.z]
  const max: Vec3 = [box.max.x, box.max.y, box.max.z]
  const fitted = fitFromBounds(min, max)
  if (!fitted.ok) return fail(fitted.problem)
  return { ok: true, fit: fitted.fit, bounds: { min, max } }
}
