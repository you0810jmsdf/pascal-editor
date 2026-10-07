// N's factory: GitHub Pages 向け静的ビルド。
//   bun run build:static [--base /ns-factory/digital-room/pascal-editor]
// 手順: next build（output:'export'）→ out/ の中の「/icons/」等のルート絶対パスにサブパスを付ける。
// ※ 上流の画像・音声パスは '/icons/...' 直書きが約270行あり、basePath だけでは直らない。
//   そのため書き出し後に、文字列として現れる素材パスだけを機械的に書き換える。
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argBase = process.argv.indexOf('--base')
const base = (argBase > 0 ? process.argv[argBase + 1] : '/ns-factory/digital-room/pascal-editor').replace(/\/$/, '')

if (!process.argv.includes('--skip-build')) {
  const build = spawnSync('bunx', ['next', 'build'], {
    cwd: appDir,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PASCAL_STATIC_EXPORT: '1', PASCAL_STATIC_BASE_PATH: base },
  })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

// 直後に「"/icons/」「url(/audios/」のように引用符や括弧の直後にくる素材パスだけを書き換える
const ROOTS = ['icons', 'audios', 'material', 'items', 'hdri', 'cursor.svg', 'fonts', 'textures', 'models']
const pattern = new RegExp(`(["'\`(=])/(${ROOTS.map((r) => r.replace('.', '\.')).join('|')})(?=[/"'\`)])`, 'g')
// distDir を '.next-static' にしているため、export の成果物もここに出る
const outDir = path.join(appDir, '.next-static')
const SUPABASE_PUBLIC = 'https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/'
let files = 0
let replaced = 0
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      walk(full)
    } else if (/\.(js|css|html|txt|json)$/.test(name)) {
      const text = readFileSync(full, 'utf8')
      // 上流の Supabase 上の素材（家具カタログ等）は、同梱コピー（/catalog/）へ向ける
      const mirrored = text.split(SUPABASE_PUBLIC).join(`${base}/catalog/`)
      const next = mirrored.replace(pattern, (_m, lead, root) => {
        replaced++
        return `${lead}${base}/${root}`
      })
      if (next !== text) {
        writeFileSync(full, next)
        files++
      }
    }
  }
}
// 3D のデコーダー(Draco / Basis)は three の同梱ファイルを成果物へコピーして自サイトから配信する
const threeLibs = [path.join(appDir, 'node_modules/three'), path.join(appDir, '../../node_modules/three')]
  .map((p) => path.join(p, 'examples/jsm/libs'))
  .find((p) => existsSync(p))
if (!threeLibs) throw new Error('three の examples/jsm/libs が見つかりません')
cpSync(path.join(threeLibs, 'draco/gltf'), path.join(outDir, 'decoders/draco'), { recursive: true })
cpSync(path.join(threeLibs, 'basis'), path.join(outDir, 'decoders/basis'), { recursive: true })

// 家具カタログ等の素材（scripts/mirror-catalog.mjs で取得済み）を成果物へコピー
cpSync(path.join(appDir, 'static-assets/catalog'), path.join(outDir, 'catalog'), { recursive: true })
// public/material に無い素材（scripts/mirror-materials.mjs で取得済み）を /material/ に重ねる
if (existsSync(path.join(appDir, 'static-assets/material'))) {
  cpSync(path.join(appDir, 'static-assets/material'), path.join(outDir, 'material'), { recursive: true })
}
walk(outDir)
console.log(`静的書き出し完了: ${outDir} / 書き換え ${replaced} 箇所 (${files} ファイル) / base=${base}`)
