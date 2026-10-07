import type { Explain } from '../explain'
import { EFFECTIVE_DATE } from '../knowledge/references'
import type { Dir, JpStorey, Pt } from '../model'
import type { BearingSegment } from '../structural/bearing-wall'

/** 図書の表紙に載せる任意情報。無ければ「－」で出す。 */
export interface DocumentMeta {
  buildingName?: string
  address?: string
  owner?: string
  designer?: string
  /** YYYY-MM-DD。無ければ生成時の日付 */
  date?: string
}

export const esc = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )

export const n = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? '－' : v.toFixed(digits)
export const cm = (v: number | null | undefined) => n(v, 0)
export const pct = (r: number | null | undefined) =>
  r === null || r === undefined ? '－' : `${Math.round(r * 100)}%`
export const dirLabel = (d: Dir) => (d === 'x' ? 'X方向' : 'Y方向')
export const judge = (ok: boolean) =>
  ok ? '<span class="ok">適合</span>' : '<span class="ng">不適合</span>'

export function today(meta: DocumentMeta): string {
  if (meta.date) return meta.date
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type Cell = string | number | null | undefined
export function table(
  headers: string[],
  rows: Cell[][],
  opts: { numeric?: number[]; caption?: string } = {},
): string {
  const numeric = new Set(opts.numeric ?? [])
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('')
  const body = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c, i) => {
            const raw = typeof c === 'string' && c.startsWith('<') ? c : esc(c)
            return `<td${numeric.has(i) ? ' class="num"' : ''}>${raw}</td>`
          })
          .join('')}</tr>`,
    )
    .join('')
  return `<table>${opts.caption ? `<caption>${esc(opts.caption)}</caption>` : ''}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

export const section = (title: string, body: string, pageBreak = false) =>
  `<section${pageBreak ? ' class="pagebreak"' : ''}><h2>${esc(title)}</h2>${body}</section>`

export const note = (text: string) => `<p class="note">${esc(text)}</p>`

/** 式・代入値・条文を折りたたみで出す（学習用）。 */
export function explainBlock(explain: Explain, title = '式と根拠'): string {
  const refs = explain.references
    .map(
      (r) =>
        `<li>${esc(r.law)} ${esc(r.article)}（施行 ${esc(r.effectiveDate)}）<a href="${esc(r.url)}" target="_blank" rel="noopener">条文を開く</a></li>`,
    )
    .join('')
  const notes = (explain.notes ?? []).map((x) => `<li>${esc(x)}</li>`).join('')
  return `<details class="explain"><summary>${esc(title)}</summary><p><b>式:</b> ${esc(explain.formula)}</p><p><b>代入:</b> ${esc(explain.substituted)}</p><ul>${refs}</ul>${notes ? `<ul class="notes">${notes}</ul>` : ''}</details>`
}

export const DISCLAIMER =
  '本図書はアプリによる計算の参考資料です。確認申請に用いるには、建築士による入力条件と結果の検証、正規の設計図書としての作成・記名が必要です。法令・告示は改正されるため、基準日と出典を確認してください。'

const CSS = `
@page { size: A4; margin: 16mm 14mm; }
* { box-sizing: border-box; }
body { font-family: "Yu Gothic", "Meiryo", "Hiragino Sans", "Noto Sans JP", sans-serif; color: #222; font-size: 10.5px; line-height: 1.55; max-width: 182mm; margin: 0 auto; padding: 8mm 0 16mm; }
h1 { font-size: 20px; text-align: center; margin: 10px 0 2px; letter-spacing: .08em; border-bottom: 3px double #333; padding-bottom: 6px; }
.subtitle { text-align: center; color: #666; margin-bottom: 10px; }
h2 { font-size: 13px; background: #2b4a6f; color: #fff; padding: 4px 10px; margin: 18px 0 8px; border-radius: 2px; }
h3 { font-size: 11.5px; border-left: 4px solid #c9a96e; padding-left: 6px; margin: 12px 0 6px; color: #2b4a6f; }
table { border-collapse: collapse; width: 100%; margin: 6px 0 8px; page-break-inside: auto; }
caption { text-align: left; font-weight: bold; margin-bottom: 2px; }
th, td { border: 1px solid #9aa4b0; padding: 3px 6px; vertical-align: top; }
th { background: #e9eef4; font-weight: bold; text-align: center; }
td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ok { color: #1b7f3b; font-weight: bold; } .ng { color: #c0392b; font-weight: bold; } .warn { color: #b26a00; font-weight: bold; } .na { color: #777; } .need { color: #7a3e9d; font-weight: bold; }
.warn-box { border: 2px solid #c0392b; background: #fdf2f1; color: #8e2a21; padding: 8px 12px; margin: 10px 0; font-weight: bold; border-radius: 4px; }
.note { font-size: 9.5px; color: #555; margin: 2px 0 6px; }
.meta td:first-child { width: 22%; background: #f4f6f8; font-weight: bold; }
details.explain { margin: 4px 0 10px; font-size: 9.5px; color: #444; border: 1px dashed #bbb; padding: 4px 8px; }
details.explain summary { cursor: pointer; color: #2b4a6f; }
.pagebreak { page-break-before: always; }
.toolbar { text-align: center; margin: 10px 0; }
.toolbar button { font-size: 13px; padding: 6px 20px; background: #2b4a6f; color: #fff; border: 0; border-radius: 4px; cursor: pointer; }
svg { display: block; margin: 6px auto; max-width: 100%; }
.legend { font-size: 9.5px; color: #555; text-align: center; }
@media print { .toolbar, details.explain summary { display: none; } details.explain { border: 0; } details.explain[open] > *:not(summary) { display: block; } }
`

export function page(title: string, subtitle: string, meta: DocumentMeta, body: string): string {
  const metaTable = `<table class="meta"><tbody>
<tr><td>建物名称</td><td>${esc(meta.buildingName ?? '－')}</td><td>作成日</td><td>${esc(today(meta))}</td></tr>
<tr><td>所在地</td><td>${esc(meta.address ?? '－')}</td><td>基準日（法令）</td><td>${esc(EFFECTIVE_DATE)} 施行の基準による</td></tr>
<tr><td>建築主</td><td>${esc(meta.owner ?? '－')}</td><td>設計者</td><td>${esc(meta.designer ?? '－')}</td></tr>
</tbody></table>`
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head>
<body>
<div class="toolbar"><button type="button" onclick="window.print()">印刷 / PDF保存</button></div>
<h1>${esc(title)}</h1>
<div class="subtitle">${esc(subtitle)}</div>
<div class="warn-box">${esc(DISCLAIMER)}</div>
${metaTable}
${body}
<p class="note">生成: 建築3Dエディタ（Pascal 日本語版）@nsfactory/kenchiku。数値は入力されたモデルに依存します。</p>
</body></html>`
}

/* ---------- 平面 SVG ---------- */

export interface PlanOptions {
  segments?: BearingSegment[]
  quarterAxis?: 0 | 1 | 'both'
  columns?: { at: Pt; label: string; ok?: boolean }[]
  showWallIds?: boolean
  labelVertices?: boolean
  width?: number
  height?: number
}

export function planSvg(storey: JpStorey, opts: PlanOptions = {}): string {
  const pts = storey.floorPolygon
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const pad = 1.0
  const w = maxX - minX + pad * 2
  const h = maxY - minY + pad * 2
  const W = opts.width ?? 560
  const H = opts.height ?? 380
  const scale = Math.min(W / w, H / h)
  const X = (x: number) => ((x - minX + pad) * scale).toFixed(1)
  const Y = (y: number) => ((y - minY + pad) * scale).toFixed(1)
  const out: string[] = []
  out.push(
    `<svg width="${Math.round(w * scale)}" height="${Math.round(h * scale)}" viewBox="0 0 ${Math.round(w * scale)} ${Math.round(h * scale)}" xmlns="http://www.w3.org/2000/svg" style="border:1px solid #c6ccd3;background:#fff">`,
  )
  // 床面積ポリゴン
  out.push(
    `<polygon points="${pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="#f6f7f9" stroke="#8a94a0" stroke-width="1"/>`,
  )
  for (const hole of storey.holes ?? [])
    out.push(
      `<polygon points="${hole.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="#fff" stroke="#8a94a0" stroke-width="1" stroke-dasharray="3 2"/>`,
    )
  // 四分割線
  if (opts.quarterAxis !== undefined) {
    const axes = opts.quarterAxis === 'both' ? [0, 1] : [opts.quarterAxis]
    for (const axis of axes)
      for (let q = 1; q <= 3; q++) {
        if (axis === 0) {
          const gx = minX + ((maxX - minX) * q) / 4
          out.push(
            `<line x1="${X(gx)}" y1="${Y(minY - 0.4)}" x2="${X(gx)}" y2="${Y(maxY + 0.4)}" stroke="#c9a96e" stroke-width="0.8" stroke-dasharray="4 3"/>`,
          )
        } else {
          const gy = minY + ((maxY - minY) * q) / 4
          out.push(
            `<line x1="${X(minX - 0.4)}" y1="${Y(gy)}" x2="${X(maxX + 0.4)}" y2="${Y(gy)}" stroke="#c9a96e" stroke-width="0.8" stroke-dasharray="4 3"/>`,
          )
        }
      }
  }
  // 壁と開口
  for (const wall of storey.walls) {
    const t = Math.max(2, wall.thickness * scale)
    out.push(
      `<line x1="${X(wall.start[0])}" y1="${Y(wall.start[1])}" x2="${X(wall.end[0])}" y2="${Y(wall.end[1])}" stroke="#aab3bd" stroke-width="${t.toFixed(1)}"/>`,
    )
    const len = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
    if (len < 0.01) continue
    const ux = (wall.end[0] - wall.start[0]) / len
    const uy = (wall.end[1] - wall.start[1]) / len
    for (const o of wall.openings) {
      const a = o.u - o.width / 2
      const b = o.u + o.width / 2
      out.push(
        `<line x1="${X(wall.start[0] + ux * a)}" y1="${Y(wall.start[1] + uy * a)}" x2="${X(wall.start[0] + ux * b)}" y2="${Y(wall.start[1] + uy * b)}" stroke="#fff" stroke-width="${(t + 1).toFixed(1)}"/>`,
      )
    }
    if (opts.showWallIds) {
      const mx = (wall.start[0] + wall.end[0]) / 2
      const my = (wall.start[1] + wall.end[1]) / 2
      out.push(
        `<text x="${X(mx - uy * 0.35)}" y="${Y(my + ux * 0.35)}" font-size="9" fill="#9a7b3a" text-anchor="middle">${esc(wall.id.replace(/^wall_/, ''))}</text>`,
      )
    }
  }
  // 耐力壁区間
  for (const s of opts.segments ?? []) {
    const color = s.quasi ? '#999' : s.direction === 'x' ? '#1a4f8b' : '#2e7d32'
    out.push(
      `<line x1="${X(s.start[0])}" y1="${Y(s.start[1])}" x2="${X(s.end[0])}" y2="${Y(s.end[1])}" stroke="${color}" stroke-width="4" stroke-linecap="butt"${s.quasi ? ' stroke-dasharray="5 3"' : ''}/>`,
    )
  }
  // 柱
  for (const c of opts.columns ?? []) {
    const fill = c.ok === false ? '#c0392b' : '#2b4a6f'
    out.push(
      `<rect x="${(parseFloat(X(c.at[0])) - 4).toFixed(1)}" y="${(parseFloat(Y(c.at[1])) - 4).toFixed(1)}" width="8" height="8" fill="${fill}"/>`,
    )
    out.push(
      `<text x="${(parseFloat(X(c.at[0])) + 6).toFixed(1)}" y="${(parseFloat(Y(c.at[1])) - 5).toFixed(1)}" font-size="9" fill="${fill}">${esc(c.label)}</text>`,
    )
  }
  if (opts.labelVertices)
    pts.forEach((p, i) => {
      out.push(
        `<text x="${(parseFloat(X(p[0])) + 3).toFixed(1)}" y="${(parseFloat(Y(p[1])) - 3).toFixed(1)}" font-size="9" fill="#444">P${i + 1}</text>`,
      )
    })
  out.push(
    '<text x="10" y="16" font-size="11" fill="#2b4a6f" font-weight="bold">Y↑ / X→（建物座標）</text>',
  )
  out.push('</svg>')
  return out.join('')
}
