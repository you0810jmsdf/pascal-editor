import type { JpBuildingInput } from '../model'
import { d6AreaTable, d7CodeCheck, d8Checklist, d9SpecSheet } from './general'
import type { DocumentMeta } from './html'
import { collectKenchikuResults, type KenchikuResults } from './results'
import {
  d1WallQuantity,
  d2QuarterMethod,
  d3NValue,
  d4ColumnSize,
  d5BearingWallPlan,
} from './structural'

export type { DocumentMeta } from './html'
export { collectKenchikuResults, type KenchikuResults } from './results'

export type DocumentId = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7' | 'D8' | 'D9'

export const DOCUMENTS: { id: DocumentId; title: string; basis: string }[] = [
  { id: 'D1', title: '壁量計算書', basis: '令46条4項・告示1100号' },
  { id: 'D2', title: '四分割法検討書', basis: '告示1100号第4' },
  { id: 'D3', title: 'N値計算書', basis: '告示1460号' },
  { id: 'D4', title: '柱の小径計算書', basis: '令43条・告示1349号' },
  { id: 'D5', title: '各階耐力壁配置図', basis: '規則1条の3' },
  { id: 'D6', title: '面積表・求積図', basis: '規則1条の3' },
  { id: 'D7', title: '建築法チェック結果', basis: '集団規定・単体規定・省エネ' },
  { id: 'D8', title: '提出図書チェックリストと手続き', basis: '法6条・規則1条の3' },
  { id: 'D9', title: '仕様表（令第37条〜第49条）', basis: '令37〜49条' },
]

const BUILDERS: Record<DocumentId, (r: KenchikuResults, meta: DocumentMeta) => string> = {
  D1: d1WallQuantity,
  D2: d2QuarterMethod,
  D3: d3NValue,
  D4: d4ColumnSize,
  D5: d5BearingWallPlan,
  D6: d6AreaTable,
  D7: d7CodeCheck,
  D8: d8Checklist,
  D9: d9SpecSheet,
}

/** 1つの図書を HTML 文字列で返す。results は collectKenchikuResults(input) を使い回せる。 */
export function buildDocument(
  id: DocumentId,
  results: KenchikuResults,
  meta: DocumentMeta = {},
): string {
  return BUILDERS[id](results, meta)
}

/** 入力から全図書を生成する。UI では results を共有し buildDocument を使う方が速い。 */
export function buildAllDocuments(
  input: JpBuildingInput,
  meta: DocumentMeta = {},
): Record<DocumentId, string> {
  const results = collectKenchikuResults(input)
  return Object.fromEntries(
    DOCUMENTS.map((d) => [d.id, buildDocument(d.id, results, meta)]),
  ) as Record<DocumentId, string>
}
