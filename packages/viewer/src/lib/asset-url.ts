import { loadAssetUrl, resolveArtifactUrl } from '@pascal-app/core'

// N's factory 静的版: 素材は自サイトから配信する。パスには書き出し時にサブパスが付いているため、
// 取得元はサイトの origin だけにする（それ以外のビルドは従来どおり）。
const STATIC_EXPORT = process.env.NEXT_PUBLIC_PASCAL_STATIC === '1'

export const ASSETS_CDN_URL =
  process.env.NEXT_PUBLIC_ASSETS_CDN_URL ||
  (STATIC_EXPORT && typeof window !== 'undefined' ? window.location.origin : 'https://editor.pascal.app')

/**
 * Resolves an asset URL to the appropriate format:
 * - If URL starts with http:// or https://, return as-is (external URL)
 * - If URL starts with asset://, resolve from IndexedDB storage
 * - If URL starts with /, prepend CDN URL (absolute path)
 * - Otherwise, prepend CDN URL (relative path)
 */
export async function resolveAssetUrl(url: string | undefined | null): Promise<string | null> {
  if (!url) return null

  if (url.startsWith('artifact://')) return resolveArtifactUrl(url)

  // External URL - use as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  // IndexedDB asset - resolve from storage
  if (url.startsWith('asset://')) {
    return loadAssetUrl(url)
  }

  // Absolute or relative path - prepend CDN URL
  const normalizedPath = url.startsWith('/') ? url : `/${url}`
  return `${ASSETS_CDN_URL}${normalizedPath}`
}

/**
 * Synchronous version for URLs that don't need IndexedDB resolution
 * Only use this if you're sure the URL is not an asset:// URL
 */
export function resolveCdnUrl(url: string | undefined | null): string | null {
  if (!url) return null

  if (url.startsWith('artifact://')) return resolveArtifactUrl(url)
  if (url.startsWith('blob:')) return url

  // External URL - use as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  // Don't use this for asset:// URLs - use resolveAssetUrl instead
  if (url.startsWith('asset://')) {
    console.warn('Use resolveAssetUrl() for asset:// URLs, not resolveCdnUrl()')
    return null
  }

  // Absolute or relative path - prepend CDN URL
  const normalizedPath = url.startsWith('/') ? url : `/${url}`
  return `${ASSETS_CDN_URL}${normalizedPath}`
}

/**
 * 静的版で 3D のデコーダー(Draco / Basis)を自サイトから読むための配信先。
 * 静的版以外・サーバー側の描画時は null（従来どおり外部CDNを使う）。
 */
export function staticDecoderPath(kind: 'draco' | 'basis'): string | null {
  if (!STATIC_EXPORT || typeof window === 'undefined') return null
  return `${window.location.origin}${process.env.NEXT_PUBLIC_PASCAL_STATIC_BASE_PATH ?? ''}/decoders/${kind}/`
}
