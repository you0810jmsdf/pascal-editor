/**
 * N's factory: 保存したマイ素材（IndexedDB）を、カタログと描画が読める家具データ（AssetInput）に変える。
 *
 * 描画側の `resolveCdnUrl` は `blob:` をそのまま通すので、GLB 本体は一時的な blob URL にして
 * `src` に差す（`asset://` は描画側が解決しない）。URL は素材ごとに1つだけ作って使い回し、
 * 削除時に破棄する。サムネイルは R4 までの間、名前の頭文字の簡易画像（SVG）を使う。
 */
import type { AssetInput } from '@pascal-app/core'
import { getMyItemFile, listMyItems, type MyItemMeta } from './my-items-store'

type UrlSet = { src: string; thumbnail: string }

const urlCache = new Map<string, UrlSet>()

/** 頭文字つきの簡易サムネイル（SVG の blob URL）。名前が空なら「?」 */
function placeholderThumbnail(name: string): string {
  const ch = (Array.from(name.trim())[0] ?? '?').replace(/[<>&"']/g, '?')
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">' +
    '<rect width="160" height="160" fill="#3f3f46"/>' +
    '<text x="80" y="104" font-size="72" text-anchor="middle" fill="#e4e4e7" ' +
    `font-family="sans-serif">${ch}</text></svg>`
  return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
}

/** 登録内容を AssetInput に変える。URL は urls（素材ごとに作成済みのもの）を使う */
export function toAssetInput(meta: MyItemMeta, urls: UrlSet): AssetInput {
  return {
    id: meta.id,
    category: meta.category,
    name: meta.name,
    // 'mine'（利用者自身の素材）。カタログの「Mine」区分と同じ意味
    source: 'mine',
    tags: [
      'mine',
      ...(meta.attachTo ? [meta.attachTo === 'ceiling' ? 'ceiling' : 'wall'] : ['floor']),
    ],
    thumbnail: meta.thumbnail || urls.thumbnail,
    src: urls.src,
    dimensions: meta.dimensions,
    offset: meta.offset,
    rotation: meta.rotation,
    scale: meta.scale,
    ...(meta.attachTo ? { attachTo: meta.attachTo } : {}),
    ...(meta.surface ? { surface: meta.surface } : {}),
  }
}

/** 保存してあるマイ素材をすべて、カタログ用の家具データとして返す。本体が見つからないものは除く。 */
export async function loadMyCatalogItems(factory?: IDBFactory): Promise<AssetInput[]> {
  const metas = await listMyItems(factory)
  const items: AssetInput[] = []
  for (const meta of metas) {
    let urls = urlCache.get(meta.id)
    if (!urls) {
      const file = await getMyItemFile(meta.id, factory)
      if (!file) continue
      urls = { src: URL.createObjectURL(file), thumbnail: placeholderThumbnail(meta.name) }
      urlCache.set(meta.id, urls)
    }
    items.push(toAssetInput(meta, urls))
  }
  return items
}

/** 削除などで不要になった素材の一時 URL を破棄する。 */
export function releaseMyItemUrls(id: string): void {
  const urls = urlCache.get(id)
  if (!urls) return
  URL.revokeObjectURL(urls.src)
  URL.revokeObjectURL(urls.thumbnail)
  urlCache.delete(id)
}
