/**
 * N's factory: 利用者が自分で読み込んだ GLB 家具（マイ素材）を、この端末・このブラウザの
 * IndexedDB だけに保存する。サーバーには送らない・サイトにもリポジトリにも載せない。
 * （threejsassets.com など配布元が素材ファイルの再配布を禁じているため、同梱せずに使う設計）
 *
 * GLB 本体も同じ記録に入れる。こうすると削除で本体も確実に消え、core の asset-storage に手を入れずに済む。
 */
import type { Vec3 } from './my-glb-fit'
import { MY_GLB_MAX_BYTES } from './my-glb-measure'

export const MY_ITEMS_DB_NAME = 'nsfactory-pascal-my-items'
const STORE = 'items'

/** カタログの AssetInput に必要な、置き方まで含めた登録内容 */
export type MyItemMeta = {
  id: string
  name: string
  category: string
  dimensions: Vec3
  offset: Vec3
  rotation: Vec3
  scale: Vec3
  attachTo?: 'wall' | 'wall-side' | 'ceiling'
  surface?: { height: number }
  /** data:URL の小さな PNG（R4 で生成。無ければ空文字） */
  thumbnail: string
  createdAt: string
  /** GLB のバイト数 */
  size: number
}

type MyItemRecord = MyItemMeta & { file: Blob }

export type NewMyItem = Omit<MyItemMeta, 'id' | 'createdAt' | 'size' | 'thumbnail'> & {
  thumbnail?: string
}

export type MyItemsStoreError = 'too-large' | 'empty-name' | 'storage'

export class MyItemsError extends Error {
  readonly kind: MyItemsStoreError
  constructor(kind: MyItemsStoreError, message: string) {
    super(message)
    this.name = 'MyItemsError'
    this.kind = kind
  }
}

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(MY_ITEMS_DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB を開けませんでした'))
  })
}

async function run<T>(
  factory: IDBFactory,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb(factory)
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

function newId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return `my-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

function toMeta(record: MyItemRecord): MyItemMeta {
  const { file: _file, ...meta } = record
  return meta
}

/** マイ素材を登録する。GLB 本体（file）と置き方を保存し、登録内容（本体を除く）を返す。 */
export async function addMyItem(
  file: Blob,
  item: NewMyItem,
  factory: IDBFactory = indexedDB,
): Promise<MyItemMeta> {
  if (file.size > MY_GLB_MAX_BYTES) {
    throw new MyItemsError('too-large', 'ファイルが大きすぎます（上限 20MB）。')
  }
  const name = item.name.trim()
  if (!name) throw new MyItemsError('empty-name', '名前を入力してください。')

  const record: MyItemRecord = {
    ...item,
    name,
    thumbnail: item.thumbnail ?? '',
    id: newId(),
    createdAt: new Date().toISOString(),
    size: file.size,
    file,
  }
  try {
    await run(factory, 'readwrite', (store) => store.add(record))
  } catch (error) {
    throw new MyItemsError(
      'storage',
      error instanceof Error
        ? `保存できませんでした（${error.message}）。空き容量を確認してください。`
        : '保存できませんでした。',
    )
  }
  return toMeta(record)
}

/** 登録が新しい順の一覧（GLB 本体は含まない）。 */
export async function listMyItems(factory: IDBFactory = indexedDB): Promise<MyItemMeta[]> {
  const records = await run<MyItemRecord[]>(factory, 'readonly', (store) => store.getAll())
  return records.map(toMeta).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** GLB 本体を取り出す（描画時に一時的な URL へ変えるのは R3）。無ければ null。 */
export async function getMyItemFile(
  id: string,
  factory: IDBFactory = indexedDB,
): Promise<Blob | null> {
  const record = await run<MyItemRecord | undefined>(factory, 'readonly', (store) => store.get(id))
  return record?.file ?? null
}

/** 登録と GLB 本体をまとめて削除する。使用中かどうかの警告は呼び出し側（R4）。 */
export async function removeMyItem(id: string, factory: IDBFactory = indexedDB): Promise<void> {
  await run(factory, 'readwrite', (store) => store.delete(id))
}

/** 登録名の変更など、置き方の補正（寸法・offset・向き・倍率・置き方）を更新する。 */
export async function updateMyItem(
  id: string,
  patch: Partial<Omit<MyItemMeta, 'id' | 'createdAt' | 'size'>>,
  factory: IDBFactory = indexedDB,
): Promise<MyItemMeta | null> {
  const db = await openDb(factory)
  try {
    return await new Promise<MyItemMeta | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      let updated: MyItemRecord | null = null
      const getReq = store.get(id)
      getReq.onsuccess = () => {
        const current = getReq.result as MyItemRecord | undefined
        if (!current) return
        updated = {
          ...current,
          ...patch,
          id: current.id,
          createdAt: current.createdAt,
          size: current.size,
        }
        store.put(updated)
      }
      tx.oncomplete = () => resolve(updated ? toMeta(updated) : null)
      tx.onabort = () => reject(tx.error ?? new Error('更新に失敗しました'))
      tx.onerror = () => reject(tx.error ?? new Error('更新に失敗しました'))
    })
  } finally {
    db.close()
  }
}
