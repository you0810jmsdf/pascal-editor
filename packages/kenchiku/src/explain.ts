export interface Reference {
  law: string
  article: string
  url: string
  effectiveDate: string
}

export interface Explain {
  formula: string
  substituted: string
  references: readonly Reference[]
  notes?: string[]
  steps?: Explain[]
}

export interface Explained<T> {
  value: T
  explain: Explain
}

export function explained<T>(
  value: T,
  formula: string,
  substituted: string,
  references: readonly Reference[],
  notes?: string[],
  steps?: Explain[],
): Explained<T> {
  return { value, explain: { formula, substituted, references, notes, steps } }
}
