// N's factory 静的版: drei の useGLTF が使う Draco デコーダーも自サイトから読む。
// （静的版以外では staticDecoderPath が null を返し、従来どおり外部CDNを使う）
import { staticDecoderPath } from '@pascal-app/viewer'
import { useGLTF } from '@react-three/drei/core/Gltf'

const dracoPath = staticDecoderPath('draco')
if (dracoPath) useGLTF.setDecoderPath(dracoPath)
