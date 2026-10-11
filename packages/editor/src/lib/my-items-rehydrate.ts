/**
 * N's factory: シーンに保存されたマイ素材（利用者が自分で読み込んだ GLB 家具）の `src` を、
 * いまのセッションで有効な一時 URL（blob:）に差し替える計画を作る純粋関数。
 *
 * シーンの家具ノードには、置いた時点の blob URL がそのまま保存される。blob URL は再読み込みで無効に
 * なるため、読み込みのたびに、素材の id（asset.id = "my-…"）から最新の URL を引き直す。
 */

export type MyItemUrls = { src: string; thumbnail: string }

type NodeLike = {
  id?: string
  type?: string
  asset?: { id?: string; src?: string; thumbnail?: string } & Record<string, unknown>
}

export type MyItemRefresh = {
  nodeId: string
  asset: NonNullable<NodeLike['asset']>
}

/** マイ素材の id かどうか（my-items-store の newId が "my-" で始まる） */
export const isMyItemId = (id: unknown): id is string =>
  typeof id === 'string' && id.startsWith('my-')

/**
 * @param nodes シーンの全ノード（id → ノード）
 * @param current 有効なマイ素材の URL（素材 id → URL）
 * @returns 差し替えが必要なノードだけ。すでに最新なら空（何度呼んでも同じ結果＝止まる）
 */
export function planMyItemRefresh(
  nodes: Record<string, unknown>,
  current: ReadonlyMap<string, MyItemUrls>,
): MyItemRefresh[] {
  const out: MyItemRefresh[] = []
  for (const [key, value] of Object.entries(nodes)) {
    const node = value as NodeLike
    if (node?.type !== 'item' || !node.asset) continue
    const urls = isMyItemId(node.asset.id) ? current.get(node.asset.id) : undefined
    if (!urls) continue
    if (node.asset.src === urls.src && node.asset.thumbnail === urls.thumbnail) continue
    out.push({
      nodeId: node.id ?? key,
      asset: { ...node.asset, src: urls.src, thumbnail: urls.thumbnail },
    })
  }
  return out
}
