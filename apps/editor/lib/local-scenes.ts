// N's factory 静的版: 複数の間取り（シーン）をブラウザ内の IndexedDB に保存する。
// サーバー(API)版の `/api/scenes` に相当する処理を、依存を足さずに素の IndexedDB で行う。
// 保存先はこの端末・このブラウザだけ。サーバーには送らない。
import type { SceneGraph } from '@pascal-app/editor'

export interface LocalSceneMeta {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  nodeCount: number
}

interface LocalSceneRecord extends LocalSceneMeta {
  graph: SceneGraph
}

const DB_NAME = 'nsfactory-pascal-scenes'
const STORE = 'scenes'

const EMPTY_GRAPH: SceneGraph = { nodes: {}, rootNodeIds: [] }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB を開けませんでした'))
  })
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = work(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request.result)
      tx.onabort = () => reject(tx.error ?? new Error('保存に失敗しました'))
      tx.onerror = () => reject(tx.error ?? new Error('保存に失敗しました'))
    })
  } finally {
    db.close()
  }
}

export function countNodes(graph: { nodes?: Record<string, unknown> | null } | null | undefined): number {
  return graph?.nodes && typeof graph.nodes === 'object' ? Object.keys(graph.nodes).length : 0
}

function newId(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function toMeta(record: LocalSceneRecord): LocalSceneMeta {
  const { id, name, createdAt, updatedAt, nodeCount } = record
  return { id, name, createdAt, updatedAt, nodeCount }
}

/** 更新が新しい順の一覧（グラフ本体は含まない）。 */
export async function listLocalScenes(): Promise<LocalSceneMeta[]> {
  const records = await run<LocalSceneRecord[]>('readonly', (store) => store.getAll())
  return records.map(toMeta).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getLocalScene(id: string): Promise<{ meta: LocalSceneMeta; graph: SceneGraph } | null> {
  const record = await run<LocalSceneRecord | undefined>('readonly', (store) => store.get(id))
  return record ? { meta: toMeta(record), graph: record.graph } : null
}

export async function createLocalScene(name: string, graph: SceneGraph = EMPTY_GRAPH): Promise<LocalSceneMeta> {
  const now = new Date().toISOString()
  const record: LocalSceneRecord = {
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    nodeCount: countNodes(graph),
    graph,
  }
  await run('readwrite', (store) => store.add(record))
  return toMeta(record)
}

/** 編集内容の保存。存在しないシーンへは書かない（削除済みの復活を防ぐ）。 */
export async function saveLocalSceneGraph(id: string, graph: SceneGraph): Promise<LocalSceneMeta | null> {
  const current = await run<LocalSceneRecord | undefined>('readonly', (store) => store.get(id))
  if (!current) return null
  const next: LocalSceneRecord = {
    ...current,
    graph,
    nodeCount: countNodes(graph),
    updatedAt: new Date().toISOString(),
  }
  await run('readwrite', (store) => store.put(next))
  return toMeta(next)
}

export async function renameLocalScene(id: string, name: string): Promise<void> {
  const current = await run<LocalSceneRecord | undefined>('readonly', (store) => store.get(id))
  if (!current) return
  await run('readwrite', (store) => store.put({ ...current, name, updatedAt: new Date().toISOString() }))
}

export async function duplicateLocalScene(id: string, name: string): Promise<LocalSceneMeta | null> {
  const source = await getLocalScene(id)
  if (!source) return null
  return createLocalScene(name, source.graph)
}

export async function deleteLocalScene(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id))
}
