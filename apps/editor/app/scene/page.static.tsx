'use client'

// N's factory 静的版: /scene/?id=<シーンID> で、ブラウザ内(IndexedDB)の間取りを開く。
// 書き出し時にシーンIDは分からないため、動的ルート(/scene/[id])ではなく検索パラメーターで受ける。
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { LocalSceneEditor } from '@/components/local-scene-editor'

function SceneFromQuery() {
  const id = useSearchParams().get('id')
  if (!id) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <h1 className="font-semibold text-lg">開く間取りが指定されていません</h1>
        <Link prefetch={false}
          className="rounded-md border border-border bg-accent px-3 py-1.5 font-medium text-sm hover:bg-accent/80"
          href="/scenes"
        >
          保存した間取りの一覧へ
        </Link>
      </div>
    )
  }
  return <LocalSceneEditor key={id} sceneId={id} />
}

export default function ScenePage() {
  return (
    <Suspense fallback={null}>
      <SceneFromQuery />
    </Suspense>
  )
}
