// N's factory: 使用中の Iconify アイコンを集めて lib/iconify-bundle.json に保存する。
//   node scripts/gen-icon-bundle.mjs
// 静的版は外部の api.iconify.design に依存しないよう、このファイルをアイコンの辞書として埋め込む。
// アイコンを増やしたら、このスクリプトを再実行して JSON をコミットする（要ネット接続）。
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(appDir, '../..')
const roots = [
  'packages',
  'apps/editor/app',
  'apps/editor/components',
  'apps/editor/lib',
  'node_modules/@pascal-app',
  'node_modules/@webxr/plugin/src',
  'node_modules/@mint/pascal-plugin/src',
].map((p) => path.join(repoRoot, p))

const files = []
const walk = (dir) => {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name === '.next' || name === '.next-static') continue
    const full = path.join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && !name.endsWith('.d.ts')) files.push(full)
  }
}
for (const root of roots) {
  // node_modules/@pascal-app は直下のパッケージの src だけを見る
  if (root.includes('node_modules/@pascal-app') || root.includes('node_modules\\@pascal-app')) {
    for (const pkg of readdirSync(root)) walk(path.join(root, pkg, 'src'))
  } else {
    walk(root)
  }
}

const collectionsRes = await fetch('https://api.iconify.design/collections')
const collections = new Set(Object.keys(await collectionsRes.json()))

const wanted = new Map() // prefix -> Set(name)
const re = /['"`]([a-z0-9]+(?:-[a-z0-9]+)*):([a-z0-9]+(?:-[a-z0-9]+)*)['"`]/g
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(re)) {
    if (!collections.has(m[1])) continue
    if (!wanted.has(m[1])) wanted.set(m[1], new Set())
    wanted.get(m[1]).add(m[2])
  }
}

const bundle = []
const missing = []
for (const [prefix, names] of wanted) {
  const list = [...names].sort()
  const res = await fetch(`https://api.iconify.design/${prefix}.json?icons=${list.join(',')}`)
  const data = await res.json()
  const got = new Set([...Object.keys(data.icons ?? {}), ...Object.keys(data.aliases ?? {})])
  for (const n of list) if (!got.has(n)) missing.push(`${prefix}:${n}`)
  if (Object.keys(data.icons ?? {}).length) bundle.push(data)
}

const out = path.join(appDir, 'lib/iconify-bundle.json')
writeFileSync(out, `${JSON.stringify(bundle)}\n`)
const total = bundle.reduce((n, c) => n + Object.keys(c.icons).length, 0)
console.log(`アイコン ${total} 個 / コレクション ${bundle.length} 件 → ${out}`)
console.log(`存在しなかった候補（文字列がアイコン名ではない可能性）: ${missing.length} 件`)
