'use client'

/**
 * N's factory: 利用者が自分で入手した GLB 家具を、このブラウザの中だけに読み込む画面。
 * 配布元（threejsassets.com など）が素材ファイルの再配布を禁じているため、サイトやリポジトリには
 * 素材を載せず、利用者の端末の IndexedDB にだけ保存する。サーバーには何も送らない。
 */
import type { AssetInput } from '@pascal-app/core'
import { staticDecoderPath } from '@pascal-app/viewer'
import { useCallback, useEffect, useState } from 'react'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { fitFromBounds, type GlbFit, type Vec3 } from '../../../lib/my-glb-fit'
import { measureGlb } from '../../../lib/my-glb-measure'
import { tm as t, tmf as tf } from '../../../lib/my-glb-strings'
import { loadMyCatalogItems, releaseMyItemUrls } from '../../../lib/my-items-runtime'
import { addMyItem, MyItemsError, removeMyItem } from '../../../lib/my-items-store'
import { cn } from '../../../lib/utils'
import { ItemsPanel } from '../sidebar/panels/items-panel'
import { CATALOG_ITEMS } from './catalog-items'

const CATEGORIES = ['furniture', 'appliance', 'kitchen', 'bathroom', 'outdoor'] as const
const CATEGORY_LABEL: Record<(typeof CATEGORIES)[number], string> = {
  furniture: 'Furniture',
  appliance: 'Appliance',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  outdoor: 'Outdoor',
}
type Placement = 'floor' | 'wall' | 'ceiling'
const PLACEMENT_LABEL: Record<Placement, string> = {
  floor: 'On the floor',
  wall: 'On a wall',
  ceiling: 'On the ceiling',
}
const UNIT_LABEL: Record<GlbFit['unit'], string> = { m: 'm', cm: 'cm', mm: 'mm' }

/** Draco 圧縮の GLB も読めるようにした読み込み器（静的版では自サイトのデコーダーを使う） */
function createLoader(): GLTFLoader {
  const loader = new GLTFLoader()
  const draco = new DRACOLoader()
  draco.setDecoderPath(
    staticDecoderPath('draco') ?? 'https://www.gstatic.com/draco/versioned/decoders/1.5.5/',
  )
  loader.setDRACOLoader(draco)
  return loader
}

type Pending = {
  file: File
  name: string
  category: (typeof CATEGORIES)[number]
  placement: Placement
  unit: GlbFit['unit']
  bounds: { min: Vec3; max: Vec3 }
  fit: GlbFit
}

const fmt = (n: number) => `${Math.round(n * 1000) / 1000}`

export function MyGlbItemsPanel() {
  const [myItems, setMyItems] = useState<AssetInput[]>([])
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setMyItems(await loadMyCatalogItems())
    } catch {
      // 保存領域が使えない環境（プライベートモード等）では、マイ素材なしで動かす
      setMyItems([])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onPickFile = async (file: File | undefined) => {
    setError(null)
    if (!file) return
    setBusy(true)
    try {
      const result = await measureGlb(await file.arrayBuffer(), createLoader())
      if (!result.ok) {
        setError(result.message)
        return
      }
      setPending({
        file,
        name: file.name.replace(/\.glb$/i, ''),
        category: 'furniture',
        placement: 'floor',
        unit: result.fit.unit,
        bounds: result.bounds,
        fit: result.fit,
      })
    } finally {
      setBusy(false)
    }
  }

  const changeUnit = (unit: GlbFit['unit']) => {
    if (!pending) return
    const fitted = fitFromBounds(pending.bounds.min, pending.bounds.max, unit)
    if (fitted.ok) setPending({ ...pending, unit, fit: fitted.fit })
  }

  const register = async () => {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      await addMyItem(pending.file, {
        name: pending.name,
        category: pending.category,
        dimensions: pending.fit.dimensions,
        offset: pending.fit.offset,
        rotation: [0, 0, 0],
        scale: pending.fit.scale,
        ...(pending.placement === 'floor' ? {} : { attachTo: pending.placement }),
      })
      setPending(null)
      await refresh()
    } catch (e) {
      setError(e instanceof MyItemsError ? e.message : t('Could not save.'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    await removeMyItem(id)
    releaseMyItemUrls(id)
    setConfirmDelete(null)
    await refresh()
  }

  const leadingTile = (
    <button
      className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border p-1.5 text-center text-[11px] text-muted-foreground transition-colors hover:cursor-pointer hover:bg-sidebar-accent hover:text-foreground"
      onClick={() => setOpen(true)}
      type="button"
    >
      <span className="text-lg leading-none">＋</span>
      {t('Load my own GLB')}
    </button>
  )

  return (
    <>
      <ItemsPanel
        items={[...CATALOG_ITEMS, ...myItems]}
        leadingTile={leadingTile}
        showSourceFilter={false}
        showTagFilters={false}
      />
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-background p-4 text-sm shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">{t('My own models')}</h2>
              <button
                className="rounded px-2 py-0.5 text-muted-foreground hover:bg-accent"
                onClick={() => {
                  setOpen(false)
                  setPending(null)
                  setError(null)
                }}
                type="button"
              >
                {t('Close')}
              </button>
            </div>
            <p className="mb-3 text-muted-foreground text-xs">
              {t(
                'Models you load here stay only in this browser. They are not uploaded and not shared. Check the license of the files you use.',
              )}
            </p>

            {!pending && (
              <label className="mb-3 block cursor-pointer rounded-lg border border-border border-dashed p-3 text-center hover:bg-accent/40">
                {busy ? t('Reading…') : t('Choose a .glb file')}
                <input
                  accept=".glb,model/gltf-binary"
                  className="hidden"
                  data-testid="my-glb-input"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    void onPickFile(f)
                  }}
                  type="file"
                />
              </label>
            )}

            {error && (
              <p className="mb-3 rounded-lg bg-red-950/50 p-2 text-red-300 text-xs" role="alert">
                {error}
              </p>
            )}

            {pending && (
              <div className="mb-3 flex flex-col gap-2 rounded-lg border border-border p-3">
                <label className="flex flex-col gap-1 text-xs">
                  {t('Name')}
                  <input
                    className="rounded bg-muted px-2 py-1"
                    data-testid="my-glb-name"
                    onChange={(e) => setPending({ ...pending, name: e.target.value })}
                    value={pending.name}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex flex-col gap-1">
                    {t('Category')}
                    <select
                      className="rounded bg-muted px-2 py-1"
                      onChange={(e) =>
                        setPending({
                          ...pending,
                          category: e.target.value as Pending['category'],
                        })
                      }
                      value={pending.category}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {t(CATEGORY_LABEL[c])}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    {t('Placement')}
                    <select
                      className="rounded bg-muted px-2 py-1"
                      onChange={(e) =>
                        setPending({ ...pending, placement: e.target.value as Placement })
                      }
                      value={pending.placement}
                    >
                      {(Object.keys(PLACEMENT_LABEL) as Placement[]).map((p) => (
                        <option key={p} value={p}>
                          {t(PLACEMENT_LABEL[p])}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-xs">
                  {t('Unit of the file')}
                  <select
                    className="rounded bg-muted px-2 py-1"
                    data-testid="my-glb-unit"
                    onChange={(e) => changeUnit(e.target.value as GlbFit['unit'])}
                    value={pending.unit}
                  >
                    {(Object.keys(UNIT_LABEL) as GlbFit['unit'][]).map((u) => (
                      <option key={u} value={u}>
                        {UNIT_LABEL[u]}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs" data-testid="my-glb-size">
                  {tf('Size (m): W {w} × H {h} × D {d}', {
                    w: fmt(pending.fit.dimensions[0]),
                    h: fmt(pending.fit.dimensions[1]),
                    d: fmt(pending.fit.dimensions[2]),
                  })}
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    className="rounded px-3 py-1 text-muted-foreground hover:bg-accent"
                    onClick={() => setPending(null)}
                    type="button"
                  >
                    {t('Cancel')}
                  </button>
                  <button
                    className="rounded bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50"
                    data-testid="my-glb-register"
                    disabled={busy || !pending.name.trim()}
                    onClick={() => void register()}
                    type="button"
                  >
                    {t('Add')}
                  </button>
                </div>
              </div>
            )}

            <h3 className="mb-1 font-medium text-xs">{t('Saved models')}</h3>
            {myItems.length === 0 ? (
              <p className="text-muted-foreground text-xs">{t('Nothing saved yet.')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {myItems.map((item) => (
                  <li
                    className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-2 py-1 text-xs"
                    key={item.id}
                  >
                    <span className="min-w-0 truncate">
                      {item.name}
                      <span className="ml-1 text-muted-foreground">
                        {item.dimensions?.map(fmt).join(' × ')} m
                      </span>
                    </span>
                    {confirmDelete === item.id ? (
                      <span className="flex shrink-0 gap-1">
                        <button
                          className={cn('rounded bg-red-600 px-2 py-0.5 text-white')}
                          data-testid="my-glb-delete-yes"
                          onClick={() => void remove(item.id)}
                          type="button"
                        >
                          {t('Delete')}
                        </button>
                        <button
                          className="rounded px-2 py-0.5 hover:bg-accent"
                          onClick={() => setConfirmDelete(null)}
                          type="button"
                        >
                          {t('Cancel')}
                        </button>
                      </span>
                    ) : (
                      <button
                        className="shrink-0 rounded px-2 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        onClick={() => setConfirmDelete(item.id)}
                        type="button"
                      >
                        {t('Delete')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  )
}
