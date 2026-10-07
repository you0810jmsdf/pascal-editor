'use client'

// N's factory 静的版: ブラウザ内(IndexedDB)に保存した間取りの一覧。
// 新規作成・開く・名前変更・複製・削除ができる。データはこの端末のブラウザだけにある。
import type { SceneGraph } from '@pascal-app/editor'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import {
  countNodes,
  createLocalScene,
  deleteLocalScene,
  duplicateLocalScene,
  listLocalScenes,
  type LocalSceneMeta,
  renameLocalScene,
} from '@/lib/local-scenes'

const TOP_SCENE_KEY = 'pascal-editor-scene'

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP')
  } catch {
    return iso
  }
}

/** トップ画面（保存先 localStorage）に間取りがあれば返す。壊れていれば null。 */
function readTopScene(): SceneGraph | null {
  try {
    const raw = localStorage.getItem(TOP_SCENE_KEY)
    if (!raw) return null
    const graph = JSON.parse(raw) as SceneGraph
    // 敷地・建物・階の3ノードだけの初期状態は「間取りあり」とみなさない
    return countNodes(graph) > 3 ? graph : null
  } catch {
    return null
  }
}

const buttonClass =
  'rounded-md border border-border bg-background px-2.5 py-1 font-medium text-xs hover:bg-accent/40 disabled:opacity-50'

export default function ScenesPage() {
  const router = useRouter()
  const [scenes, setScenes] = useState<LocalSceneMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [topScene, setTopScene] = useState<SceneGraph | null>(null)

  const reload = useCallback(async () => {
    try {
      setScenes(await listLocalScenes())
      setError(null)
    } catch (e) {
      setScenes([])
      setError(`保存した間取りを読み込めませんでした: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [])

  useEffect(() => {
    void reload()
    setTopScene(readTopScene())
  }, [reload])

  const guard = useCallback(
    async (work: () => Promise<void>) => {
      setBusy(true)
      try {
        await work()
        setError(null)
      } catch (e) {
        setError(`操作に失敗しました: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const createNew = () =>
    guard(async () => {
      const meta = await createLocalScene('無題の間取り')
      router.push(`/scene/?id=${meta.id}`)
    })

  const importTop = () =>
    guard(async () => {
      if (!topScene) return
      const meta = await createLocalScene('トップ画面の間取り', topScene)
      router.push(`/scene/?id=${meta.id}`)
    })

  const commitRename = (id: string) =>
    guard(async () => {
      const next = draft.trim()
      setRenamingId(null)
      if (!next) return
      await renameLocalScene(id, next)
      await reload()
    })

  const duplicate = (scene: LocalSceneMeta) =>
    guard(async () => {
      await duplicateLocalScene(scene.id, `${scene.name} のコピー`)
      await reload()
    })

  const remove = (scene: LocalSceneMeta) =>
    guard(async () => {
      // 画面内の2段押しで確認する（埋め込み表示では window.confirm が出ないため）
      if (confirmId !== scene.id) {
        setConfirmId(scene.id)
        return
      }
      setConfirmId(null)
      await deleteLocalScene(scene.id)
      await reload()
    })

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-border border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between gap-4 px-6 py-4">
          <nav className="flex items-center gap-4 text-sm">
            <Link prefetch={false} className="text-muted-foreground transition-colors hover:text-foreground" href="/">
              ホーム
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium text-foreground">保存した間取り</span>
          </nav>
          <button
            className="rounded-md border border-border bg-accent px-3 py-1.5 font-medium text-sm hover:bg-accent/80 disabled:opacity-50"
            disabled={busy}
            onClick={createNew}
            type="button"
          >
            新しい間取りを作成
          </button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10">
        <h1 className="mb-2 font-bold text-3xl">保存した間取り</h1>
        <p className="mb-6 text-muted-foreground text-sm">
          間取りは、このブラウザの中だけに保存されます（サーバーには送られません）。ブラウザのデータを消去すると、保存した間取りも消えます。
        </p>

        {error ? (
          <p className="mb-6 rounded-md border border-destructive/50 px-3 py-2 text-destructive text-sm">{error}</p>
        ) : null}

        {topScene ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4 text-sm">
            <span>
              トップ画面に、まだ一覧に入っていない間取り（{countNodes(topScene)} 個の部品）があります。
            </span>
            <button className={buttonClass} disabled={busy} onClick={importTop} type="button">
              一覧に保存して開く
            </button>
          </div>
        ) : null}

        {scenes === null ? (
          <p className="text-muted-foreground text-sm">読み込み中…</p>
        ) : scenes.length === 0 ? (
          <div className="rounded-lg border border-border border-dashed p-10 text-center">
            <p className="mb-4 text-muted-foreground text-sm">まだ保存した間取りがありません。</p>
            <button className={buttonClass} disabled={busy} onClick={createNew} type="button">
              新しい間取りを作成
            </button>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scenes.map((scene) => (
              <li className="flex flex-col gap-3 rounded-lg border border-border p-4" key={scene.id}>
                {renamingId === scene.id ? (
                  <input
                    aria-label="間取りの名前"
                    autoFocus
                    className="rounded border border-border bg-background px-2 py-1 text-sm"
                    maxLength={60}
                    onBlur={() => commitRename(scene.id)}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    value={draft}
                  />
                ) : (
                  <Link prefetch={false}
                    className="truncate font-semibold text-base hover:underline"
                    href={`/scene/?id=${scene.id}`}
                    title={scene.name}
                  >
                    {scene.name}
                  </Link>
                )}
                <p className="text-muted-foreground text-xs">
                  更新 {formatDate(scene.updatedAt)} ／ 部品 {scene.nodeCount} 個
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link prefetch={false} className={buttonClass} href={`/scene/?id=${scene.id}`}>
                    開く
                  </Link>
                  <button
                    className={buttonClass}
                    disabled={busy}
                    onClick={() => {
                      setDraft(scene.name)
                      setRenamingId(scene.id)
                    }}
                    type="button"
                  >
                    名前を変更
                  </button>
                  <button className={buttonClass} disabled={busy} onClick={() => duplicate(scene)} type="button">
                    複製
                  </button>
                  <button
                    className={`${buttonClass} ${confirmId === scene.id ? 'border-destructive text-destructive' : ''}`}
                    disabled={busy}
                    onBlur={() => setConfirmId((current) => (current === scene.id ? null : current))}
                    onClick={() => remove(scene)}
                    type="button"
                  >
                    {confirmId === scene.id ? '本当に削除する' : '削除'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
