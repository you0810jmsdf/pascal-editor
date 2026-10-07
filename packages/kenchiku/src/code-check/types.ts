import type { Explain } from '../explain'

/**
 * ok: 基準を満たす / ng: 満たさない / warn: 判定できないが対応が要る・近似で判定した /
 * n/a: この建物には適用されない / input-needed: 人が入力しないと判定できない（無理に判定しない）
 */
export type CheckStatus = 'ok' | 'ng' | 'warn' | 'n/a' | 'input-needed'

export interface CodeCheck {
  id: string
  title: string
  status: CheckStatus
  /** 実測値の表示（単位付き・人が読む文） */
  measured?: string
  /** 基準値の表示 */
  limit?: string
  message: string
  explain: Explain
}

export interface CodeCheckReport {
  checks: CodeCheck[]
  counts: Record<CheckStatus, number>
  /** ng が1つも無く、input-needed も無いときだけ true。warn は妨げない */
  ok: boolean
}
