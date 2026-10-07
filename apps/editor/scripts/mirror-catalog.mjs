// N's factory: 家具カタログ等の素材（上流の Supabase ストレージ上）を static-assets/catalog/ に保存する。
//   node scripts/mirror-catalog.mjs
// 取得元・取得日・サイズを MANIFEST.json に記録する（出典: Pascal Editor https://github.com/pascalorg/editor ）。
// 静的版のビルドは、この保存先を成果物の /catalog/ にコピーし、Supabase の URL をそこへ書き換える。
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(appDir, '../..')
const HOST = 'https://byrpxoiotywskoojsrzd.supabase.co/storage/v1/object/public/'
const roots = ['packages', 'apps/editor/app', 'apps/editor/components', 'apps/editor/lib',
  'node_modules/@pascal-app', 'node_modules/@webxr/plugin/src', 'node_modules/@mint/pascal-plugin/src'].map((p) => path.join(repoRoot, p))

const files = []
const walk = (dir) => {
  let entries
  try { entries = readdirSync(dir) } catch { return }
  for (const name of entries) {
    if (['node_modules', 'dist', '.next', '.next-static', 'static-assets'].includes(name)) continue
    const full = path.join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) walk(full)
    else if (/\.(ts|tsx|json)$/.test(name) && !/\.test\./.test(name) && !name.endsWith('.d.ts')) files.push(full)
  }
}
for (const root of roots) {
  if (/node_modules[\/]@pascal-app$/.test(root)) {
    for (const pkg of readdirSync(root)) { walk(path.join(root, pkg, 'src')); walk(path.join(root, pkg, 'data')) }
  } else walk(root)
}

const urls = new Set()
const stop = new Set(["'", '"', '`', ')', ' ', '\n', '\r', '\t'])
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  let from = 0
  for (;;) {
    const at = text.indexOf(HOST, from)
    if (at < 0) break
    let end = at + HOST.length
    while (end < text.length && !stop.has(text[end])) end++
    urls.add(text.slice(at, end))
    from = end
  }
}
const list = [...urls].sort()
console.log(`対象 ${list.length} ファイル`)

const outRoot = path.join(appDir, 'static-assets/catalog')
const manifest = { source: HOST, project: 'https://github.com/pascalorg/editor', fetchedAt: new Date().toISOString(), files: [] }
let done = 0
let failed = 0
const queue = [...list]
const worker = async () => {
  while (queue.length) {
    const url = queue.shift()
    const rel = url.slice(HOST.length)
    const dest = path.join(outRoot, rel)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      mkdirSync(path.dirname(dest), { recursive: true })
      writeFileSync(dest, buf)
      manifest.files.push({ path: rel, bytes: buf.length })
    } catch (e) {
      failed++
      console.log('失敗', url, String(e))
    }
    if (++done % 50 === 0) console.log(`${done}/${list.length}`)
  }
}
await Promise.all(Array.from({ length: 6 }, worker))
manifest.files.sort((a, b) => a.path.localeCompare(b.path))
writeFileSync(path.join(outRoot, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 1)}\n`)
const total = manifest.files.reduce((n, f) => n + f.bytes, 0)
console.log(`完了: ${manifest.files.length} ファイル / ${(total / 1024 / 1024).toFixed(1)} MB / 失敗 ${failed}`)
