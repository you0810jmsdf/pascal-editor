/**
 * N's factory 日本語化。英語の文言をキーにした辞書。
 * 辞書に無い文言は英語のまま返す（未翻訳でも画面は壊れない）。
 * 保存データのID・内部名は翻訳しない。表示ラベルだけを t() に通す。
 */
import { ja } from './i18n-ja'

// 上流のテストは英語の文言で照合するため、テスト実行中は翻訳しない
const IS_TEST = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test'

export function t(text: string): string {
  if (IS_TEST) return text
  const direct = ja[text]
  if (direct !== undefined) return direct
  // 「Snapping: Grid」のような「見出し: 値」形式は両側を個別に訳す
  const sep = text.indexOf(': ')
  if (sep > 0) return `${t(text.slice(0, sep))}: ${t(text.slice(sep + 2))}`
  return text
}

/** `{name}` 形式の差し込みつき。例: tf('Delete {name}?', { name: 'Wall 1' }) */
export function tf(text: string, vars: Record<string, string | number>): string {
  return t(text).replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match,
  )
}

/** 文字列のときだけ訳す（ReactNode を受ける部品用）。 */
export function tn<T>(node: T): T | string {
  return typeof node === 'string' ? t(node) : node
}
