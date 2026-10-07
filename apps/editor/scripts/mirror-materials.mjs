// N's factory: リポジトリの public/material に入っていない素材(テクスチャ)を、上流の配信元から
// static-assets/material/ に保存する。
//   node scripts/mirror-materials.mjs
// 上流は public/ に素材の一部しか持たず、残りは自社CDN(editor.pascal.app)から配信している。
// 静的版は外部に接続しない方針のため、足りない分を同梱する。取得元・日時・サイズは MANIFEST.json に記録する。
// 静的ビルド(build-static.mjs)が、この保存先を成果物の /material/ に重ねてコピーする。
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(appDir, '../..')
const SOURCE = 'https://editor.pascal.app'
const roots = ['packages/core/src', 'packages/viewer/src', 'packages/editor/src', 'packages/nodes/src', 'apps/editor/lib', 'apps/editor/components'].map((p) =>
  path.join(repoRoot, p),
)

const files = []
const walk = (dir) => {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (['node_modules', 'dist', '.next', '.next-static'].includes(name)) continue
    const full = path.join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(full)
    else if (/\.(ts|tsx|json)$/.test(name) && !/\.test\./.test(name) && !name.endsWith('.d.ts')) files.push(full)
  }
}
for (const root of roots) walk(root)

// 「/material/<カテゴリ>/<素材名>/…ktx2」の文字列を、正規表現を使わずに拾う
const stop = new Set(["'", '"', '`', ')', ' ', '\n', '\r', '\t', ',', ';'])
const refs = new Set()
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  let from = 0
  for (;;) {
    const at = text.indexOf('/material/', from)
    if (at < 0) break
    let end = at
    while (end < text.length && !stop.has(text[end])) end++
    const candidate = text.slice(at, end)
    // コード内の説明用の書式（{category} など）は実在する名前ではない
    const isAsset = ['.ktx2', '.webp', '.png', '.jpg'].some((ext) => candidate.endsWith(ext))
    if (isAsset && !candidate.includes('{') && !candidate.includes('$')) refs.add(candidate)
    from = Math.max(end, at + 1)
  }
}

const publicDir = path.join(appDir, 'public')
// 参照パスは「/material/…」で始まるので、保存先は static-assets（その下に material/ ができる）
const outRoot = path.join(appDir, 'static-assets')
const manifestDir = path.join(outRoot, 'material')
const missing = [...refs].filter((r) => !existsSync(path.join(publicDir, r))).sort()
console.log(`参照 ${refs.size} / public に無い ${missing.length}`)

const manifest = { source: SOURCE, project: 'https://github.com/pascalorg/editor', fetchedAt: new Date().toISOString(), files: [] }
let failed = 0
let done = 0
const queue = [...missing]
const worker = async () => {
  while (queue.length) {
    const rel = queue.shift()
    const dest = path.join(outRoot, rel)
    if (existsSync(dest)) {
      // 取得済みはやり直さない（manifest にだけ記録する）
      manifest.files.push({ path: rel, bytes: statSync(dest).size })
      done++
      continue
    }
    try {
      // 通信が不安定なことがあるので、3回まで試す
      let buf
      for (let attempt = 1; attempt <= 3 && !buf; attempt++) {
        try {
          const res = await fetch(SOURCE + rel)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          buf = Buffer.from(await res.arrayBuffer())
        } catch (e) {
          if (attempt === 3) throw e
          await new Promise((r) => setTimeout(r, 1500 * attempt))
        }
      }
      mkdirSync(path.dirname(dest), { recursive: true })
      writeFileSync(dest, buf)
      manifest.files.push({ path: rel, bytes: buf.length })
    } catch (e) {
      failed++
      console.log('失敗', rel, String(e))
    }
    if (++done % 50 === 0) console.log(`${done}/${missing.length}`)
  }
}
await Promise.all(Array.from({ length: 6 }, worker))
manifest.files.sort((a, b) => a.path.localeCompare(b.path))
mkdirSync(manifestDir, { recursive: true })
writeFileSync(path.join(manifestDir, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 1)}\n`)
const total = manifest.files.reduce((n, f) => n + f.bytes, 0)
console.log(`完了: ${manifest.files.length} ファイル / ${(total / 1024 / 1024).toFixed(1)} MB / 失敗 ${failed}`)
