'use client'

// N's factory 静的版: IndexedDB に保存した1つの間取り（シーン）をエディタで開く。
// サーバー版の SceneLoader に相当するが、保存先はこの端末のブラウザ内だけ。
import type { SceneGraph } from '@pascal-app/editor'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { countGraphNodes, isEmptyGraphOverwrite } from '@/lib/empty-graph-guard'
import {
  getLocalScene,
  type LocalSceneMeta,
  renameLocalScene,
  saveLocalSceneGraph,
} from '@/lib/local-scenes'
import { Workspace } from '../app/page'

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; meta: LocalSceneMeta; graph: SceneGraph }

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function LocalSceneEditor({ sceneId }: { sceneId: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    getLocalScene(sceneId)
      .then((scene) => {
        if (cancelled) return
        setState(scene ? { status: 'ready', meta: scene.meta, graph: scene.graph } : { status: 'missing' })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      })
    return () => {
      cancelled = true
    }
  }, [sceneId])

  if (state.status === 'loading') {
    return <Notice title="間取りを読み込んでいます…" />
  }
  if (state.status === 'missing') {
    return <Notice title="この間取りは見つかりませんでした" detail="削除されたか、別のブラウザで作成された可能性があります。" />
  }
  if (state.status === 'error') {
    return <Notice title="間取りを読み込めませんでした" detail={state.message} />
  }
  return <Ready graph={state.graph} meta={state.meta} />
}

function Notice({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <h1 className="font-semibold text-lg">{title}</h1>
      {detail ? <p className="max-w-md text-muted-foreground text-sm">{detail}</p> : null}
      <Link prefetch={false}
        className="rounded-md border border-border bg-accent px-3 py-1.5 font-medium text-sm hover:bg-accent/80"
        href="/scenes"
      >
        保存した間取りの一覧へ
      </Link>
    </div>
  )
}

function Ready({ meta, graph }: { meta: LocalSceneMeta; graph: SceneGraph }) {
  // 保存済みの内容より少ない（空の）状態で上書きしない。エディタの読み込み前に
  // 空のデータが保存されて間取りが消える事故（サーバー版で実際に起きた）への備え。
  const knownNodeCountRef = useRef(countGraphNodes(graph))
  const [name, setName] = useState(meta.name)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(meta.name)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleLoad = useCallback(async () => graph, [graph])

  const handleSave = useCallback(
    async (next: SceneGraph) => {
      const outgoing = countGraphNodes(next)
      if (isEmptyGraphOverwrite(outgoing, knownNodeCountRef.current)) {
        setError('空の状態での上書き保存を止めました（保存済みの間取りは変わっていません）')
        return
      }
      try {
        const saved = await saveLocalSceneGraph(meta.id, next)
        if (!saved) {
          setError('この間取りは削除されたため、保存できませんでした')
          return
        }
        knownNodeCountRef.current = saved.nodeCount
        setSavedAt(saved.updatedAt)
        setError(null)
      } catch (e) {
        setError(`保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [meta.id],
  )

  const commitRename = useCallback(async () => {
    setEditing(false)
    const next = draft.trim()
    if (!next || next === name) {
      setDraft(name)
      return
    }
    try {
      await renameLocalScene(meta.id, next)
      setName(next)
    } catch (e) {
      setError(`名前を変更できませんでした: ${e instanceof Error ? e.message : String(e)}`)
      setDraft(name)
    }
  }, [draft, meta.id, name])

  const overlay = (
    <div className="pointer-events-none absolute top-14 left-1/2 z-40 w-[min(92vw,34rem)] -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-background/90 px-4 py-1.5 text-xs shadow-sm backdrop-blur">
        <Link prefetch={false} className="shrink-0 font-medium hover:underline" href="/scenes">
          ← 一覧
        </Link>
        {editing ? (
          <input
            aria-label="間取りの名前"
            autoFocus
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-0.5 text-foreground"
            maxLength={60}
            onBlur={commitRename}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                setDraft(name)
                setEditing(false)
              }
            }}
            value={draft}
          />
        ) : (
          <button
            className="min-w-0 flex-1 truncate text-left font-semibold hover:underline"
            onClick={() => {
              setDraft(name)
              setEditing(true)
            }}
            title="クリックして名前を変更"
            type="button"
          >
            {name}
          </button>
        )}
        <span className="shrink-0 text-muted-foreground">
          {error ? <span className="text-destructive">{error}</span> : savedAt ? `保存 ${formatTime(savedAt)}` : '自動保存'}
        </span>
      </div>
    </div>
  )

  return <Workspace onLoad={handleLoad} onSave={handleSave} overlay={overlay} projectId={`scene-${meta.id}`} />
}
