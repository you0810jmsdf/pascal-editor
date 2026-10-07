'use client'

import {
  BEARING_RATIOS,
  type BearingKind,
  buildDocument,
  type CheckStatus,
  DOCUMENTS,
  type DocumentId,
  TIMBER_FC,
} from '@nsfactory/kenchiku'
import {
  type AnyNode,
  type AnyNodeId,
  type BuildingNode,
  findJpBuilding,
  jpStoreyLevels,
  type LevelNode,
  type SiteNode,
  type WallNode,
  type ZoneNode,
  useScene,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { type ReactNode, useMemo, useRef, useState } from 'react'
import { cn } from '../../../../../lib/utils'
import useKenchiku from '../../../../../store/use-kenchiku'
import { PanelSection } from '../../../controls/panel-section'

type Tab = 'settings' | 'walls' | 'results' | 'documents'

const TABS: { id: Tab; label: string }[] = [
  { id: 'settings', label: '設定' },
  { id: 'walls', label: '耐力壁' },
  { id: 'results', label: '結果' },
  { id: 'documents', label: '図書' },
]

const KIND_OPTIONS: { value: BearingKind | ''; label: string }[] = [
  { value: '', label: '非耐力壁（集計しない）' },
  { value: 'panel-plywood', label: '構造用合板 大壁（2.5）' },
  { value: 'panel-gypsum', label: 'せっこうボード 大壁（0.9）' },
  { value: 'brace-15x90', label: '筋かい 1.5×9cm・鉄筋9φ（1.0）' },
  { value: 'brace-30x90', label: '筋かい 3×9cm（1.5）' },
  { value: 'brace-45x90', label: '筋かい 4.5×9cm（2.0）' },
  { value: 'brace-90x90', label: '筋かい 9×9cm（3.0）' },
  { value: 'brace-15x90-x', label: '筋かい たすき 1.5×9（2.0）' },
  { value: 'brace-30x90-x', label: '筋かい たすき 3×9（3.0）' },
  { value: 'brace-45x90-x', label: '筋かい たすき 4.5×9（4.0）' },
  { value: 'brace-90x90-x', label: '筋かい たすき 9×9（5.0）' },
  { value: 'lath-one', label: '木ずり 片面（0.5）' },
  { value: 'lath-both', label: '木ずり 両面（1.0）' },
  { value: 'panel-other', label: 'その他の面材（倍率を入力）' },
  { value: 'custom', label: '大臣認定等（倍率を入力）' },
]

const ZONING_OPTIONS = [
  ['', '未設定'],
  ['R1-low', '第一種低層住居専用'],
  ['R2-low', '第二種低層住居専用'],
  ['R-garden', '田園住居'],
  ['R1-mid', '第一種中高層住居専用'],
  ['R2-mid', '第二種中高層住居専用'],
  ['R1', '第一種住居'],
  ['R2', '第二種住居'],
  ['quasi-R', '準住居'],
  ['neighbor-com', '近隣商業'],
  ['com', '商業'],
  ['quasi-ind', '準工業'],
  ['ind', '工業'],
  ['ind-only', '工業専用'],
  ['none', '用途地域の指定なし'],
] as const

const ROOM_KIND_OPTIONS = [
  ['', '未設定（居室扱い）'],
  ['living', '居室'],
  ['non-living', '非居室'],
  ['kitchen', '台所（火気使用室）'],
  ['toilet', '便所'],
  ['bath', '浴室'],
  ['stair', '階段'],
  ['corridor', '廊下'],
  ['storage', '納戸・収納'],
] as const

const STATUS_LABEL: Record<CheckStatus, { text: string; className: string }> = {
  ok: { text: '適合', className: 'text-emerald-600 dark:text-emerald-400' },
  ng: { text: '不適合', className: 'text-red-600 dark:text-red-400' },
  warn: { text: '要確認', className: 'text-amber-600 dark:text-amber-400' },
  'n/a': { text: '対象外', className: 'text-muted-foreground' },
  'input-needed': { text: '入力待ち', className: 'text-violet-600 dark:text-violet-400' },
}

const inputClass =
  'h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/40'
const buttonClass =
  'inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-2.5 text-xs text-foreground hover:bg-accent disabled:opacity-50'
const primaryButtonClass =
  'inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50'

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="text-[10px] text-muted-foreground/80">{hint}</span> : null}
    </label>
  )
}

function NumberField({
  label,
  value,
  onChange,
  step = 0.1,
  hint,
  placeholder,
}: {
  label: string
  value: number | undefined
  onChange: (value: number | undefined) => void
  step?: number
  hint?: string
  placeholder?: string
}) {
  return (
    <Field hint={hint} label={label}>
      <input
        className={inputClass}
        inputMode="decimal"
        onChange={(e) => {
          const v = e.target.value.trim()
          onChange(v === '' ? undefined : Number(v))
        }}
        placeholder={placeholder}
        step={step}
        type="number"
        value={value ?? ''}
      />
    </Field>
  )
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string
  value: T | ''
  options: readonly (readonly [T | '', string])[]
  onChange: (value: T | '') => void
  hint?: string
}) {
  return (
    <Field hint={hint} label={label}>
      <select className={inputClass} onChange={(e) => onChange(e.target.value as T | '')} value={value}>
        {options.map(([v, text]) => (
          <option key={v || '__empty'} value={v}>
            {text}
          </option>
        ))}
      </select>
    </Field>
  )
}

function fmt(v: number | null | undefined, digits = 1) {
  return v === null || v === undefined || !Number.isFinite(v) ? '－' : v.toFixed(digits)
}

/** undefined の値は捨てて jp を丸ごと書き戻す（optional フィールドなので無い項目は消える）。 */
function cleanJp<T extends Record<string, unknown>>(jp: T): T {
  return Object.fromEntries(Object.entries(jp).filter(([, v]) => v !== undefined)) as T
}

function downloadHtml(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** 新しいタブで開けたら true。ポップアップが止められる環境（埋め込みブラウザ等）では false。 */
function openHtmlInTab(html: string): boolean {
  if (typeof window === 'undefined') return false
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const opened = window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return !!opened
}

export default function KenchikuPanel() {
  const nodes = useScene((s) => s.nodes) as Record<string, AnyNode>
  const updateNode = useScene((s) => s.updateNode)
  const selectedIds = useViewer((s) => s.selection.selectedIds)
  const [tab, setTab] = useState<Tab>('settings')
  const [buildingId, setBuildingId] = useState<string | undefined>(undefined)
  const kenchiku = useKenchiku()

  const buildings = useMemo(
    () => Object.values(nodes).filter((n): n is BuildingNode => n.type === 'building'),
    [nodes],
  )
  const building = useMemo(() => {
    try {
      return findJpBuilding(nodes, buildingId ?? (buildings.length === 1 ? undefined : buildings[0]?.id))
    } catch {
      return undefined
    }
  }, [nodes, buildingId, buildings])
  const site = useMemo(() => {
    const parent = building?.parentId ? nodes[building.parentId] : undefined
    return parent?.type === 'site' ? (parent as SiteNode) : undefined
  }, [nodes, building])
  const levels = useMemo(() => (building ? jpStoreyLevels(nodes, building) : []), [nodes, building])
  const stale = kenchiku.results !== null && kenchiku.computedFor !== nodes

  const patchBuildingJp = (patch: Record<string, unknown>) => {
    if (!building) return
    const jp = cleanJp({ ...(building.jp ?? {}), ...patch })
    updateNode(building.id as AnyNodeId, { jp } as Partial<AnyNode>)
  }
  const patchSiteJp = (patch: Record<string, unknown>) => {
    if (!site) return
    const jp = cleanJp({ ...(site.jp ?? {}), ...patch })
    updateNode(site.id as AnyNodeId, { jp } as Partial<AnyNode>)
  }
  const setWallKind = (wall: WallNode, kind: BearingKind | '', ratioOverride?: number) => {
    const { bearing: _old, ...rest } = wall.jp ?? {}
    const jp = kind
      ? { ...rest, bearing: { kinds: [kind], ...(ratioOverride !== undefined ? { ratioOverride } : {}) } }
      : rest
    updateNode(wall.id as AnyNodeId, { jp: Object.keys(jp).length ? jp : undefined } as Partial<AnyNode>)
  }
  const compute = () => kenchiku.compute(nodes, building?.id)

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="border-border border-b px-3 pt-3 pb-2">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="font-medium text-sm">建築法規（日本・木造）</div>
            <div className="text-[10px] text-muted-foreground">2025年4月施行の基準。結果は設計検討用の参考値です。</div>
          </div>
          <button className={primaryButtonClass} disabled={!building} onClick={compute} type="button">
            計算する
          </button>
        </div>
        {buildings.length > 1 ? (
          <select className={inputClass} onChange={(e) => setBuildingId(e.target.value)} value={building?.id ?? ''}>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name ?? b.id}
              </option>
            ))}
          </select>
        ) : null}
        {!building ? <div className="mt-1 text-amber-600">建物（building）がありません。壁を描いて階を作ると対象になります。</div> : null}
        {stale ? <div className="mt-1 text-amber-600">モデルが変わりました。「計算する」で結果を更新してください。</div> : null}
        {kenchiku.error ? <div className="mt-1 text-red-600">{kenchiku.error}</div> : null}
        <div className="mt-2 flex gap-1">
          {TABS.map((t) => (
            <button
              className={cn(
                'flex-1 rounded-md px-2 py-1 text-xs',
                tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
              key={t.id}
              onClick={() => setTab(t.id)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'settings' ? (
          <SettingsTab building={building} levels={levels} nodes={nodes} patchBuildingJp={patchBuildingJp} patchSiteJp={patchSiteJp} site={site} updateNode={updateNode} />
        ) : null}
        {tab === 'walls' ? <WallsTab levels={levels} nodes={nodes} selectedIds={selectedIds} setWallKind={setWallKind} /> : null}
        {tab === 'results' ? <ResultsTab onCompute={compute} /> : null}
        {tab === 'documents' ? <DocumentsTab building={building} nodes={nodes} /> : null}
      </div>
    </div>
  )
}

function SettingsTab({
  building,
  site,
  levels,
  nodes,
  patchBuildingJp,
  patchSiteJp,
  updateNode,
}: {
  building: BuildingNode | undefined
  site: SiteNode | undefined
  levels: LevelNode[]
  nodes: Record<string, AnyNode>
  patchBuildingJp: (patch: Record<string, unknown>) => void
  patchSiteJp: (patch: Record<string, unknown>) => void
  updateNode: (id: AnyNodeId, data: Partial<AnyNode>) => void
}) {
  const jp = building?.jp
  const sjp = site?.jp
  const meta = useKenchiku((s) => s.meta)
  const setMeta = useKenchiku((s) => s.setMeta)
  const timberOptions = useMemo(() => {
    const seen = new Set<string>()
    return TIMBER_FC.filter((t) => {
      const key = `${t.standard}|${t.species}|${t.grade}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [])
  const timberValue = jp?.timber ? `${jp.timber.standard}|${jp.timber.species}|${jp.timber.grade}` : ''
  const roads = sjp?.roads ?? []
  const edgeCount = site?.polygon?.points?.length ?? 0
  const zones = levels.flatMap((level) =>
    Object.values(nodes).filter((n): n is ZoneNode => n.type === 'zone' && n.parentId === level.id).map((zone) => ({ level, zone })),
  )

  return (
    <div className="flex flex-col">
      <PanelSection title="図書の表紙">
        <div className="grid grid-cols-1 gap-2 px-3 pb-2">
          <Field label="建物名称">
            <input className={inputClass} onChange={(e) => setMeta({ buildingName: e.target.value || undefined })} value={meta.buildingName ?? ''} />
          </Field>
          <Field label="所在地">
            <input className={inputClass} onChange={(e) => setMeta({ address: e.target.value || undefined })} value={meta.address ?? ''} />
          </Field>
          <Field label="設計者（記名欄）">
            <input className={inputClass} onChange={(e) => setMeta({ designer: e.target.value || undefined })} value={meta.designer ?? ''} />
          </Field>
        </div>
      </PanelSection>

      <PanelSection title="建物の仕様（荷重の算定に使う）">
        {!building ? (
          <div className="px-3 pb-2 text-muted-foreground">建物がありません。</div>
        ) : (
          <div className="grid grid-cols-1 gap-2 px-3 pb-2">
            <SelectField label="屋根ふき材" onChange={(v) => patchBuildingJp({ roofKind: v || undefined })} options={[['', '未設定（スレートで計算）'], ['tile', '瓦屋根（ふき土無）'], ['slate', 'スレート屋根'], ['metal', '金属板ぶき']] as const} value={jp?.roofKind ?? ''} />
            <SelectField label="外壁" onChange={(v) => patchBuildingJp({ extWall: v || undefined })} options={[['', '未設定（サイディングで計算）'], ['earthen', '土塗り壁等'], ['mortar', 'モルタル等'], ['siding', 'サイディング'], ['metal', '金属板張'], ['board', '下見板張']] as const} value={jp?.extWall ?? ''} />
            <SelectField label="太陽光発電設備等" onChange={(v) => patchBuildingJp({ pv: v ? { kind: v } : undefined })} options={[['', 'なし'], ['standard', 'あり（200 N/㎡）']] as const} value={jp?.pv?.kind === 'standard' ? 'standard' : ''} />
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="天井断熱 (N/㎡)" onChange={(v) => patchBuildingJp({ ceilingInsulationNPerM2: v })} placeholder="100" step={10} value={jp?.ceilingInsulationNPerM2} />
              <NumberField label="外壁断熱 (N/㎡)" onChange={(v) => patchBuildingJp({ wallInsulationNPerM2: v })} placeholder="70" step={10} value={jp?.wallInsulationNPerM2} />
            </div>
            <SelectField label="用途（積載荷重）" onChange={(v) => patchBuildingJp({ use: v || undefined })} options={[['', '住宅'], ['house', '住宅'], ['office', '事務所']] as const} value={jp?.use ?? ''} />
            <Field hint="柱の小径の算定に使う圧縮基準強度 Fc" label="柱の木材">
              <select
                className={inputClass}
                onChange={(e) => {
                  const [standard, species, grade] = e.target.value.split('|')
                  patchBuildingJp({ timber: e.target.value ? { standard, species, grade } : undefined })
                }}
                value={timberValue}
              >
                <option value="">すぎ 無等級材（Fc 17.7）</option>
                {timberOptions.map((t) => (
                  <option key={`${t.standard}|${t.species}|${t.grade}`} value={`${t.standard}|${t.species}|${t.grade}`}>
                    {t.standard} {t.species} {t.grade}（Fc {t.fc}）
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <NumberField hint="屋根ノードから自動。無ければ入力" label="最高高さ−軒高 (m)" onChange={(v) => patchBuildingJp({ roofRiseOverride: v })} value={jp?.roofRiseOverride} />
              <NumberField label="軒の出 (m)" onChange={(v) => patchBuildingJp({ overhangOverride: v })} value={jp?.overhangOverride} />
              <NumberField label="勾配 (寸)" onChange={(v) => patchBuildingJp({ pitchSunOverride: v })} step={0.5} value={jp?.pitchSunOverride} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SelectField
                label="基礎の形式（参考章）"
                onChange={(v) =>
                  patchBuildingJp({
                    foundation: v ? { ...(jp?.foundation ?? {}), type: v } : undefined,
                  })
                }
                options={
                  [
                    ['', '未設定'],
                    ['strip', '布基礎'],
                    ['mat', 'べた基礎'],
                    ['pile', '杭基礎'],
                  ] as const
                }
                value={jp?.foundation?.type ?? ''}
              />
              <NumberField
                hint="地盤調査の長期許容応力度。未入力は 30 で参考計算"
                label="地耐力 (kN/㎡)"
                onChange={(v) =>
                  patchBuildingJp({
                    foundation: { type: jp?.foundation?.type ?? 'mat', soilBearingKnM2: v },
                  })
                }
                step={5}
                value={jp?.foundation?.soilBearingKnM2}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="耐力壁の最小長さ (m)" onChange={(v) => patchBuildingJp({ minBearingLength: v })} placeholder="0.9" step={0.05} value={jp?.minBearingLength} />
              <label className="flex items-end gap-2 pb-1 text-xs">
                <input checked={jp?.quasiWalls ?? false} onChange={(e) => patchBuildingJp({ quasiWalls: e.target.checked || undefined })} type="checkbox" />
                準耐力壁等を算入（必要壁量の1/2まで）
              </label>
            </div>
          </div>
        )}
      </PanelSection>

      <PanelSection title="敷地の法規（人が入力）">
        {!site ? (
          <div className="px-3 pb-2 text-muted-foreground">敷地（site）がありません。</div>
        ) : (
          <div className="grid grid-cols-1 gap-2 px-3 pb-2">
            <SelectField label="用途地域" onChange={(v) => patchSiteJp({ zoning: v || undefined })} options={ZONING_OPTIONS} value={sjp?.zoning ?? ''} />
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="指定建蔽率 (%)" onChange={(v) => patchSiteJp({ kenpeiPct: v })} step={10} value={sjp?.kenpeiPct} />
              <NumberField label="指定容積率 (%)" onChange={(v) => patchSiteJp({ yosekiPct: v })} step={10} value={sjp?.yosekiPct} />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input checked={sjp?.cornerLotBonus ?? false} onChange={(e) => patchSiteJp({ cornerLotBonus: e.target.checked || undefined })} type="checkbox" />
              角地緩和（建蔽率 +10%）
            </label>
            <SelectField label="防火の指定" onChange={(v) => patchSiteJp({ fireZone: v || undefined })} options={[['', '未設定'], ['none', '指定なし'], ['art22', '法22条区域'], ['quasi', '準防火地域'], ['fire', '防火地域']] as const} value={sjp?.fireZone ?? ''} />
            <div className="grid grid-cols-2 gap-2">
              <NumberField hint="低層住専は 10 または 12" label="絶対高さの限度 (m)" onChange={(v) => patchSiteJp({ absoluteHeightLimit: v })} step={1} value={sjp?.absoluteHeightLimit} />
              <NumberField hint="指定なしは 0" label="外壁後退 (m)" onChange={(v) => patchSiteJp({ wallSetback: v })} step={0.5} value={sjp?.wallSetback} />
            </div>
            <Field hint="敷地境界の辺番号は 0 から（点 i → 点 i+1 の辺）" label="接道する道路">
              <div className="flex flex-col gap-1">
                {roads.map((road, i) => (
                  <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-1" key={`${i}-${road.edgeIndex}`}>
                    <select
                      className={inputClass}
                      onChange={(e) => {
                        const next = roads.map((r, k) => (k === i ? { ...r, edgeIndex: Number(e.target.value) } : r))
                        patchSiteJp({ roads: next })
                      }}
                      value={road.edgeIndex}
                    >
                      {Array.from({ length: Math.max(edgeCount, 1) }, (_, k) => (
                        <option key={k} value={k}>
                          辺 {k}
                        </option>
                      ))}
                    </select>
                    <input
                      className={inputClass}
                      onChange={(e) => patchSiteJp({ roads: roads.map((r, k) => (k === i ? { ...r, width: Number(e.target.value) } : r)) })}
                      placeholder="幅員 m"
                      step={0.5}
                      type="number"
                      value={road.width}
                    />
                    <select
                      className={inputClass}
                      onChange={(e) => patchSiteJp({ roads: roads.map((r, k) => (k === i ? { ...r, type: e.target.value as typeof r.type } : r)) })}
                      value={road.type}
                    >
                      <option value="art42-1">法42条1項</option>
                      <option value="art42-2">2項道路</option>
                      <option value="other">その他</option>
                    </select>
                    <button className={buttonClass} onClick={() => patchSiteJp({ roads: roads.filter((_, k) => k !== i) })} type="button">
                      ×
                    </button>
                  </div>
                ))}
                <button className={buttonClass} onClick={() => patchSiteJp({ roads: [...roads, { edgeIndex: 0, width: 4, type: 'art42-1' }] })} type="button">
                  道路を追加
                </button>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                hint="平面の上を 0° として時計回り"
                label="真北の向き (°)"
                onChange={(v) => site && updateNode(site.id as AnyNodeId, { northRotation: v === undefined ? undefined : (v * Math.PI) / 180 } as Partial<AnyNode>)}
                step={1}
                value={site.northRotation === undefined ? undefined : Math.round((site.northRotation * 180) / Math.PI)}
              />
              <SelectField hint="軟弱地盤の指定区域は 0.3" label="標準せん断力係数 C0" onChange={(v) => patchSiteJp({ seismicC0: v ? Number(v) : undefined })} options={[['', '0.2（一般）'], ['0.3', '0.3（令88条2項区域）']] as const} value={sjp?.seismicC0 === 0.3 ? '0.3' : ''} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField hint="一般 50・強風区域 50超〜75" label="風の係数 (cm/㎡)" onChange={(v) => patchSiteJp({ windCoef: v })} step={5} value={sjp?.windCoef} />
              <NumberField hint="省エネ基準の地域（印西市は 6）" label="省エネ地域区分" onChange={(v) => patchSiteJp({ energyRegion: v })} step={1} value={sjp?.energyRegion} />
            </div>
            <Field label="提出先メモ">
              <input className={inputClass} onChange={(e) => patchSiteJp({ authority: e.target.value || undefined })} placeholder="例：印西市 開発建築課 建築指導係" value={sjp?.authority ?? ''} />
            </Field>
          </div>
        )}
      </PanelSection>

      <PanelSection title="部屋の種別（採光・換気・天井高の判定に使う）">
        {zones.length === 0 ? (
          <div className="px-3 pb-2 text-muted-foreground">部屋（zone）がありません。</div>
        ) : (
          <div className="flex flex-col gap-2 px-3 pb-2">
            {zones.map(({ level, zone }) => (
              <div className="grid grid-cols-[1fr_1fr_80px] items-end gap-1" key={zone.id}>
                <div className="truncate text-xs">
                  <span className="text-muted-foreground">{level.name ?? `${level.level + 1}階`}</span> {zone.name}
                </div>
                <select
                  className={inputClass}
                  onChange={(e) =>
                    updateNode(zone.id as AnyNodeId, { jp: cleanJp({ ...(zone.jp ?? {}), roomKind: e.target.value || undefined }) } as Partial<AnyNode>)
                  }
                  value={zone.jp?.roomKind ?? ''}
                >
                  {ROOM_KIND_OPTIONS.map(([v, text]) => (
                    <option key={v || '__'} value={v}>
                      {text}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClass}
                  onChange={(e) =>
                    updateNode(zone.id as AnyNodeId, {
                      jp: cleanJp({ ...(zone.jp ?? {}), daylightNeighborDistance: e.target.value === '' ? undefined : Number(e.target.value) }),
                    } as Partial<AnyNode>)
                  }
                  placeholder="採光 d (m)"
                  step={0.1}
                  title="採光補正係数の d：窓から隣地境界線（道路なら反対側）までの水平距離"
                  type="number"
                  value={zone.jp?.daylightNeighborDistance ?? ''}
                />
              </div>
            ))}
          </div>
        )}
      </PanelSection>
    </div>
  )
}

function WallsTab({
  levels,
  nodes,
  selectedIds,
  setWallKind,
}: {
  levels: LevelNode[]
  nodes: Record<string, AnyNode>
  selectedIds: readonly string[]
  setWallKind: (wall: WallNode, kind: BearingKind | '', ratioOverride?: number) => void
}) {
  const [bulkKind, setBulkKind] = useState<BearingKind | ''>('panel-plywood')
  const [bulkRatio, setBulkRatio] = useState<number | undefined>(undefined)
  const showOverlay = useKenchiku((s) => s.showBearingOverlay)
  const setShowOverlay = useKenchiku((s) => s.setShowBearingOverlay)
  const results = useKenchiku((s) => s.results)
  const selectedWalls = selectedIds.map((id) => nodes[id]).filter((n): n is WallNode => !!n && n.type === 'wall')
  const needsRatio = bulkKind === 'custom' || bulkKind === 'panel-other'
  const applyTo = (walls: WallNode[]) => {
    for (const wall of walls) setWallKind(wall, bulkKind, needsRatio ? bulkRatio : undefined)
  }
  const wallLabel = (wall: WallNode) => wall.name ?? wall.id.replace(/^wall_/, '')
  const length = (wall: WallNode) => Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
  const specLabel = (wall: WallNode) => {
    const b = wall.jp?.bearing
    if (!b) return '－'
    const kinds = b.kinds.filter((k) => k !== 'combined')
    const ratio = kinds.reduce((sum, k) => sum + ((k === 'custom' || k === 'panel-other' ? b.ratioOverride : BEARING_RATIOS[k]) ?? 0), 0)
    return `${kinds.map((k) => KIND_OPTIONS.find((o) => o.value === k)?.label.replace(/（.*$/, '') ?? k).join('+')}（${Math.min(7, ratio).toFixed(1)}）`
  }

  return (
    <div className="flex flex-col">
      <PanelSection title="仕様をまとめて設定">
        <div className="flex flex-col gap-2 px-3 pb-2">
          <SelectField label="耐力壁の仕様（告示1100号別表第1）" onChange={(v) => setBulkKind(v)} options={KIND_OPTIONS.map((o) => [o.value, o.label] as const)} value={bulkKind} />
          {needsRatio ? <NumberField label="壁倍率（0〜7）" onChange={setBulkRatio} step={0.1} value={bulkRatio} /> : null}
          <div className="flex flex-wrap gap-1">
            <button className={buttonClass} disabled={selectedWalls.length === 0 || (needsRatio && bulkRatio === undefined)} onClick={() => applyTo(selectedWalls)} type="button">
              選択中の壁に適用（{selectedWalls.length}）
            </button>
            {levels.map((level) => {
              const walls = Object.values(nodes).filter((n): n is WallNode => n.type === 'wall' && n.parentId === level.id)
              return (
                <button className={buttonClass} disabled={needsRatio && bulkRatio === undefined} key={level.id} onClick={() => applyTo(walls)} type="button">
                  {level.name ?? `${level.level + 1}階`}の全壁に適用
                </button>
              )
            })}
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} type="checkbox" />
            平面図に耐力壁の区間を色で表示（青＝X方向・緑＝Y方向・計算後）
          </label>
          {!results ? <div className="text-[10px] text-muted-foreground">区間の色分けは「計算する」の後に表示されます。</div> : null}
        </div>
      </PanelSection>
      {levels.map((level) => {
        const walls = Object.values(nodes).filter((n): n is WallNode => n.type === 'wall' && n.parentId === level.id)
        return (
          <PanelSection key={level.id} title={`${level.name ?? `${level.level + 1}階`}の壁（${walls.length}）`}>
            <div className="flex flex-col gap-1 px-3 pb-2">
              {walls.map((wall) => {
                const current = wall.jp?.bearing?.kinds.find((k) => k !== 'combined') ?? ''
                return (
                  <div className={cn('grid grid-cols-[72px_1fr] items-center gap-1 rounded px-1', selectedIds.includes(wall.id) ? 'bg-accent/60' : '')} key={wall.id}>
                    <div className="truncate" title={`${wallLabel(wall)}・${length(wall).toFixed(2)}m・${specLabel(wall)}`}>
                      <div className="truncate text-xs">{wallLabel(wall)}</div>
                      <div className="text-[10px] text-muted-foreground">{length(wall).toFixed(2)} m</div>
                    </div>
                    <select
                      className={inputClass}
                      onChange={(e) => setWallKind(wall, e.target.value as BearingKind | '', wall.jp?.bearing?.ratioOverride)}
                      value={current}
                    >
                      {KIND_OPTIONS.map((o) => (
                        <option key={o.value || '__'} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}
              {walls.length === 0 ? <div className="text-muted-foreground">壁がありません。</div> : null}
            </div>
          </PanelSection>
        )
      })}
    </div>
  )
}

function Judge({ ok }: { ok: boolean }) {
  return <span className={ok ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'font-medium text-red-600 dark:text-red-400'}>{ok ? '適合' : '不適合'}</span>
}

function ResultsTab({ onCompute }: { onCompute: () => void }) {
  const results = useKenchiku((s) => s.results)
  const adapterNotes = useKenchiku((s) => s.adapterNotes)
  const showExplain = useKenchiku((s) => s.showExplain)
  const setShowExplain = useKenchiku((s) => s.setShowExplain)
  if (!results)
    return (
      <div className="flex flex-col gap-2 p-3">
        <div className="text-muted-foreground">まだ計算していません。</div>
        <button className={primaryButtonClass} onClick={onCompute} type="button">
          計算する
        </button>
      </div>
    )
  const req = results.required.value
  const code = results.code.value
  const dir = (d: string) => (d === 'x' ? 'X' : 'Y')
  return (
    <div className="flex flex-col">
      <PanelSection title="総合">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 pb-2">
          <div>壁量（全階・両方向）</div>
          <Judge ok={results.existing.value.ok} />
          <div>四分割法</div>
          <Judge ok={results.quarter.value.ok} />
          <div>法規チェック</div>
          <div>
            適合 {code.counts.ok}・不適合 <span className={code.counts.ng ? 'text-red-600' : ''}>{code.counts.ng}</span>・要確認 {code.counts.warn}・入力待ち {code.counts['input-needed']}
          </div>
          <label className="col-span-2 mt-1 flex items-center gap-2">
            <input checked={showExplain} onChange={(e) => setShowExplain(e.target.checked)} type="checkbox" />
            式と代入値を表示（学習用）
          </label>
        </div>
      </PanelSection>
      <PanelSection title="必要壁量（地震）">
        <table className="mx-3 mb-2 w-[calc(100%-1.5rem)] text-[11px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-normal">階</th>
              <th className="text-right font-normal">床面積 ㎡</th>
              <th className="text-right font-normal">Lw cm/㎡</th>
              <th className="text-right font-normal">必要 cm</th>
            </tr>
          </thead>
          <tbody>
            {results.input.storeys.map((s, i) => (
              <tr key={s.index}>
                <td>{s.index}階</td>
                <td className="text-right">{fmt(s.floorArea, 2)}</td>
                <td className="text-right">{fmt(req.lw[i], 0)}</td>
                <td className="text-right">{fmt(req.requiredCm[i], 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {showExplain ? <div className="whitespace-pre-wrap break-all px-3 pb-2 text-[10px] text-muted-foreground">{results.required.explain.formula}{'\n'}{results.required.explain.substituted}</div> : null}
      </PanelSection>
      <PanelSection title="壁量の判定（階・方向）">
        <table className="mx-3 mb-2 w-[calc(100%-1.5rem)] text-[11px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-normal">階/方向</th>
              <th className="text-right font-normal">存在</th>
              <th className="text-right font-normal">地震</th>
              <th className="text-right font-normal">風</th>
              <th className="text-right font-normal">充足率</th>
              <th className="text-right font-normal">判定</th>
            </tr>
          </thead>
          <tbody>
            {results.existing.value.rows.map((row) => (
              <tr key={`${row.value.storey}${row.value.direction}`}>
                <td>
                  {row.value.storey}階 {dir(row.value.direction)}
                </td>
                <td className="text-right">{fmt(row.value.existingCm, 0)}</td>
                <td className="text-right">{fmt(row.value.quakeCm, 0)}</td>
                <td className="text-right">{fmt(row.value.windCm, 0)}</td>
                <td className="text-right">{row.value.ratio === null ? '－' : `${Math.round(row.value.ratio * 100)}%`}</td>
                <td className="text-right">
                  <Judge ok={row.value.ok} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </PanelSection>
      <PanelSection title="四分割法">
        <table className="mx-3 mb-2 w-[calc(100%-1.5rem)] text-[11px]">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-normal">階/方向</th>
              <th className="text-right font-normal">充足率</th>
              <th className="text-right font-normal">壁率比</th>
              <th className="text-right font-normal">判定</th>
            </tr>
          </thead>
          <tbody>
            {results.quarter.value.rows.map((row) => (
              <tr key={`${row.value.storey}${row.value.direction}`}>
                <td>
                  {row.value.storey}階 {dir(row.value.direction)}
                </td>
                <td className="text-right">{row.value.ratios.map((r) => (r === null ? '－' : `${Math.round(r * 100)}%`)).join(' / ')}</td>
                <td className="text-right">{row.value.wallRatio === null ? '－' : row.value.wallRatio.toFixed(2)}</td>
                <td className="text-right">
                  <Judge ok={row.value.ok} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </PanelSection>
      <PanelSection title="N値（厳しい柱 5 本）と柱の小径">
        <div className="px-3 pb-2 text-[11px]">
          {results.nValues.value.rows
            .slice()
            .sort((a, b) => b.value.governing.n - a.value.governing.n)
            .slice(0, 5)
            .map((row) => (
              <div className="flex justify-between" key={row.value.column.id}>
                <span>
                  {row.value.storey}階 {row.value.column.id.replace(/^.*column:?/, '')}
                  {row.value.corner ? '（出隅）' : ''}
                </span>
                <span>
                  N={row.value.governing.n.toFixed(2)} → {row.value.governing.hardware.symbol}
                </span>
              </div>
            ))}
          <div className="mt-1 text-muted-foreground">柱 {results.nValues.value.rows.length} 本</div>
          {results.columns.value.storeys.map((s) => (
            <div className="flex justify-between" key={s.value.index}>
              <span>{s.value.index}階 必要小径</span>
              <span>
                外周 {s.value.exterior.value.de}mm（{s.value.exterior.value.ratio}）・内部 {s.value.interior.value.de}mm
              </span>
            </div>
          ))}
        </div>
      </PanelSection>
      <PanelSection title="法規チェック">
        <div className="flex flex-col gap-1 px-3 pb-2">
          {code.checks.map((c) => (
            <div className="rounded border border-border/60 px-2 py-1" key={c.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs">{c.title}</div>
                <div className={cn('shrink-0 text-xs', STATUS_LABEL[c.status].className)}>{STATUS_LABEL[c.status].text}</div>
              </div>
              <div className="text-[10px] text-muted-foreground">{c.message}</div>
              {c.measured ? <div className="text-[10px]">実測：{c.measured}</div> : null}
              {c.limit ? <div className="text-[10px]">基準：{c.limit}</div> : null}
              <div className="text-[10px]">
                {c.explain.references.map((r) => (
                  <a className="text-primary underline" href={r.url} key={r.url + r.article} rel="noopener noreferrer" target="_blank">
                    {r.law} {r.article}
                  </a>
                ))}
              </div>
              {showExplain ? <div className="whitespace-pre-wrap break-all text-[10px] text-muted-foreground">{c.explain.formula}</div> : null}
            </div>
          ))}
        </div>
      </PanelSection>
      {adapterNotes.length ? (
        <PanelSection title="計算の前提・注記">
          <ul className="list-disc px-3 pb-2 pl-7 text-[10px] text-muted-foreground">
            {adapterNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </PanelSection>
      ) : null}
    </div>
  )
}

function DocumentsTab({
  building,
  nodes,
}: {
  building: BuildingNode | undefined
  nodes: Record<string, AnyNode>
}) {
  const kenchiku = useKenchiku()
  const [preview, setPreview] = useState<{ id: DocumentId; title: string; html: string } | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const build = (id: DocumentId) => {
    const results =
      kenchiku.results && kenchiku.computedFor === nodes
        ? kenchiku.results
        : kenchiku.compute(nodes, building?.id)
    if (!results) return null
    const title = DOCUMENTS.find((d) => d.id === id)?.title ?? id
    return { id, title, html: buildDocument(id, results, kenchiku.meta) }
  }
  const open = (id: DocumentId) => {
    const doc = build(id)
    if (!doc) return
    // 新しいタブが開ける環境ではタブで。開けなければ画面内に表示（印刷・保存はそこから）。
    if (!openHtmlInTab(doc.html)) setPreview(doc)
  }
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="text-[10px] text-muted-foreground">
        新しいタブで開き、ブラウザの印刷で PDF にできます。タブが開けない環境では画面内に表示し、そこから印刷・HTML
        保存ができます。各図書の冒頭に免責（参考資料・建築士の検証が必要）が入ります。
      </div>
      {DOCUMENTS.map((d) => (
        <div className="flex gap-1" key={d.id}>
          <button
            className={cn(buttonClass, 'flex-1 justify-between')}
            disabled={!building}
            onClick={() => open(d.id)}
            type="button"
          >
            <span>
              {d.id} {d.title}
            </span>
            <span className="text-[10px] text-muted-foreground">{d.basis}</span>
          </button>
          <button
            className={buttonClass}
            disabled={!building}
            onClick={() => {
              const doc = build(d.id)
              if (doc) downloadHtml(doc.html, `${doc.id}_${doc.title}.html`)
            }}
            title="HTML ファイルとして保存"
            type="button"
          >
            保存
          </button>
        </div>
      ))}
      {preview ? (
        <div className="fixed inset-0 z-[70] flex flex-col bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-background shadow-xl">
            <div className="flex items-center justify-between gap-2 border-border border-b px-3 py-2">
              <div className="truncate text-sm">
                {preview.id} {preview.title}
              </div>
              <div className="flex gap-1">
                <button
                  className={buttonClass}
                  onClick={() => frameRef.current?.contentWindow?.print()}
                  type="button"
                >
                  印刷 / PDF保存
                </button>
                <button
                  className={buttonClass}
                  onClick={() => downloadHtml(preview.html, `${preview.id}_${preview.title}.html`)}
                  type="button"
                >
                  HTMLを保存
                </button>
                <button className={buttonClass} onClick={() => setPreview(null)} type="button">
                  閉じる
                </button>
              </div>
            </div>
            <iframe
              className="h-full w-full flex-1 bg-white"
              ref={frameRef}
              sandbox="allow-same-origin allow-modals"
              srcDoc={preview.html}
              title={preview.title}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
