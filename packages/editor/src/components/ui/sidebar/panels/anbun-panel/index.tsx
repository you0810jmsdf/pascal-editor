'use client'

/**
 * N's factory: 家事按分パネル。部屋（zone）ごとに事業用／私用／共用を付け、
 * 部屋の内側（内法）の面積から按分率を出し、根拠表（CSV・印刷）を作る。
 * 面積は zone の多角形から壁の占める部分を引いたもの（= 内法）。
 */
import {
  type AnyNode,
  type AnyNodeId,
  area,
  difference,
  type LevelNode,
  levelWallCover,
  NS_ZONE_USES,
  type NsZoneUse,
  useScene,
  type WallNode,
  type ZoneNode,
} from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useMemo } from 'react'
import {
  type AnbunResult,
  type AnbunRoomInput,
  anbunCsv,
  computeAnbun,
  formatM2,
  formatRatio,
} from '../../../../../lib/anbun'
import { cn } from '../../../../../lib/utils'

const USE_LABEL: Record<NsZoneUse, string> = {
  business: '事業用',
  private: '私用',
  shared: '共用',
}

const inputClass =
  'h-7 w-full rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary'
const buttonClass =
  'rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent disabled:opacity-50'

const levelLabel = (level: LevelNode) => level.name ?? `${level.level + 1}階`

/** undefined は捨てて ns を丸ごと書き戻す（空なら undefined＝項目ごと消す） */
function cleanNs(ns: Record<string, unknown>) {
  const entries = Object.entries(ns).filter(([, v]) => v !== undefined)
  return entries.length ? Object.fromEntries(entries) : undefined
}

/** 内法の面積（㎡）: 部屋の多角形から、その階の壁が占める部分を引く */
function insideArea(zone: ZoneNode, walls: readonly WallNode[]): number {
  const footprint = { outer: zone.polygon, holes: zone.holes ?? [] }
  if (zone.polygon.length < 3) return 0
  try {
    return area(difference(footprint, levelWallCover(walls)))
  } catch {
    return area([footprint])
  }
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function downloadText(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

/** 印刷用の根拠表（HTML）。新しいタブで開き、ブラウザの印刷で PDF にできる */
function evidenceHtml(result: AnbunResult, date: string): string {
  const rows = result.rows
    .map(
      (r) =>
        `<tr><td>${esc(r.level)}</td><td>${esc(r.name)}</td><td class="n">${r.area.toFixed(2)}</td><td>${USE_LABEL[r.use]}</td><td class="n">${r.use === 'shared' ? `${(r.share * 100).toFixed(0)}%` : ''}</td><td>${r.count ? '○' : '×'}</td><td class="n">${r.businessArea.toFixed(2)}</td></tr>`,
    )
    .join('')
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>家事按分の根拠表 ${esc(date)}</title>
<style>body{font-family:sans-serif;margin:24px;color:#111}h1{font-size:18px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #999;padding:4px 8px}th{background:#eee}td.n{text-align:right}.sum{margin-top:12px;font-size:14px}.note{margin-top:16px;font-size:12px;color:#444}@media print{button{display:none}}</style></head>
<body><h1>家事按分の根拠表（床面積按分）</h1><div>作成日: ${esc(date)}</div>
<table><thead><tr><th>階</th><th>部屋</th><th>面積(㎡)</th><th>区分</th><th>共用割合</th><th>総面積に数える</th><th>事業分(㎡)</th></tr></thead><tbody>${rows}</tbody></table>
<div class="sum">総面積: <b>${result.totalArea.toFixed(2)} ㎡</b>　事業分: <b>${result.businessArea.toFixed(2)} ㎡</b>　按分率: <b>${formatRatio(result.ratio)}</b></div>
<div class="note">計算式: 按分率 = 事業分の面積 ÷ 総面積。面積は部屋の内側（内法）で計測。共用の部屋は面積 × 共用割合を事業分とする。「総面積に数える」が × の部屋は、総面積にも事業分にも入れない。</div>
<button onclick="window.print()" style="margin-top:16px">印刷</button></body></html>`
}

export default function AnbunPanel() {
  const nodes = useScene((s) => s.nodes) as Record<string, AnyNode>
  const updateNode = useScene((s) => s.updateNode)
  const setSelection = useViewer((s) => s.setSelection)

  const levels = useMemo(
    () =>
      Object.values(nodes)
        .filter((n): n is LevelNode => n.type === 'level')
        .sort((a, b) => a.level - b.level),
    [nodes],
  )

  const rooms = useMemo<{ zone: ZoneNode; input: AnbunRoomInput }[]>(() => {
    const out: { zone: ZoneNode; input: AnbunRoomInput }[] = []
    for (const level of levels) {
      const children = Object.values(nodes).filter((n) => n.parentId === level.id)
      const walls = children.filter((n): n is WallNode => n.type === 'wall')
      const zones = children
        .filter((n): n is ZoneNode => n.type === 'zone')
        .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      for (const zone of zones) {
        out.push({
          zone,
          input: {
            id: zone.id,
            name: zone.name,
            level: levelLabel(level),
            area: insideArea(zone, walls),
            use: zone.ns?.use,
            share: zone.ns?.share,
            count: zone.ns?.count,
          },
        })
      }
    }
    return out
  }, [nodes, levels])

  const result = useMemo(() => computeAnbun(rooms.map((r) => r.input)), [rooms])

  const patchNs = (zone: ZoneNode, patch: Record<string, unknown>) => {
    updateNode(zone.id as AnyNodeId, {
      ns: cleanNs({ ...(zone.ns ?? {}), ...patch }),
    } as Partial<AnyNode>)
  }

  const select = (zone: ZoneNode) => setSelection({ selectedIds: [zone.id] })

  const exportCsv = () =>
    downloadText(
      anbunCsv(result, {
        title: '家事按分の根拠表（床面積按分）',
        date: todayIso(),
        note: '面積は部屋の内側（内法）で計測。建築3Dエディタで作成',
      }),
      `家事按分_根拠表_${todayIso()}.csv`,
      'text/csv;charset=utf-8',
    )

  const openPrint = () => {
    const url = URL.createObjectURL(
      new Blob([evidenceHtml(result, todayIso())], { type: 'text/html;charset=utf-8' }),
    )
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="border-border border-b px-3 pt-3 pb-2">
        <div className="font-medium text-sm">家事按分（床面積）</div>
        <div className="text-[10px] text-muted-foreground">
          部屋ごとに区分を付けると、内法の面積から按分率を出します。
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <div className="font-semibold text-2xl" data-testid="anbun-ratio">
            {formatRatio(result.ratio)}
          </div>
          <div className="text-muted-foreground">
            事業分 {formatM2(result.businessArea)} ÷ 総面積 {formatM2(result.totalArea)}
          </div>
        </div>
        {result.unsetCount > 0 && (
          <div className="mt-1 text-amber-600">
            区分が未設定の部屋が {result.unsetCount} 件あります（私用として計算中）。
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <button className={buttonClass} disabled={rooms.length === 0} onClick={exportCsv} type="button">
            根拠表（CSV）
          </button>
          <button className={buttonClass} disabled={rooms.length === 0} onClick={openPrint} type="button">
            根拠表（印刷）
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {rooms.length === 0 ? (
          <div className="text-muted-foreground">
            部屋（zone）がありません。壁で囲むか、部屋ツールで部屋を作ってください。
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {rooms.map(({ zone, input }) => {
              const row = result.rows.find((r) => r.id === zone.id)
              return (
                <div
                  className="rounded-md border border-border p-2"
                  data-testid="anbun-room"
                  key={zone.id}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      className="min-w-0 truncate text-left hover:underline"
                      onClick={() => select(zone)}
                      title="3D で選択"
                      type="button"
                    >
                      <span className="text-muted-foreground">{input.level}</span> {zone.name}
                    </button>
                    <span className={cn('shrink-0 tabular-nums', !row?.count && 'line-through opacity-60')}>
                      {formatM2(input.area)}
                    </span>
                  </div>
                  <div className="mt-1 grid grid-cols-[1fr_72px_auto] items-center gap-1">
                    <select
                      className={inputClass}
                      data-testid="anbun-use"
                      onChange={(e) => {
                        const v = e.target.value as NsZoneUse | ''
                        patchNs(zone, {
                          use: v || undefined,
                          share: v === 'shared' ? (zone.ns?.share ?? 0.5) : undefined,
                        })
                      }}
                      value={zone.ns?.use ?? ''}
                    >
                      <option value="">未設定（私用扱い）</option>
                      {NS_ZONE_USES.map((u) => (
                        <option key={u} value={u}>
                          {USE_LABEL[u]}
                        </option>
                      ))}
                    </select>
                    <input
                      className={cn(inputClass, zone.ns?.use !== 'shared' && 'invisible')}
                      max={100}
                      min={0}
                      onChange={(e) =>
                        patchNs(zone, { share: Math.min(100, Math.max(0, Number(e.target.value))) / 100 })
                      }
                      step={5}
                      title="共用の事業割合（%）"
                      type="number"
                      value={Math.round((zone.ns?.share ?? 0) * 100)}
                    />
                    <label className="flex items-center gap-1 whitespace-nowrap" title="総面積に数える">
                      <input
                        checked={zone.ns?.count ?? true}
                        onChange={(e) => patchNs(zone, { count: e.target.checked ? undefined : false })}
                        type="checkbox"
                      />
                      数える
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
