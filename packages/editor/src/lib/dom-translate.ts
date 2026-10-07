/**
 * N's factory 静的版: 画面に出た英語の文字を、辞書に従って日本語に置き換える。
 *
 * 外部プラグインの文言や、保存データ（家具名・色名・自動で付く「Wall 1」など）は、ソースを書き換えて
 * t() を通すことができない。そこで、表示された文字だけを後から置き換える。
 *   - 置き換えるのはテキストノードの中身と title / aria-label / placeholder / alt 属性だけ。
 *   - 要素の追加・削除・並べ替えはしない（React の管理する構造には触れない）。
 *   - 辞書に無い文字・すでに日本語を含む文字・入力欄の中身は触らない。
 *   - 保存データの中身は変わらない（見た目だけ）。
 */
import { ja } from './i18n-ja'
import { jaPatterns, jaUi } from './i18n-ja-ui'

// 先に決めた辞書（i18n-ja.ts）を優先する
const dictionary: Record<string, string> = { ...jaUi, ...ja }
const hasJapanese = /[぀-ヿ㐀-鿿]/
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'NOSCRIPT', 'CODE', 'PRE'])
const ATTRIBUTES = ['title', 'aria-label', 'placeholder', 'alt'] as const

/** 置き換え後の文字を返す。置き換える必要がなければ null。 */
export function translateDisplay(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed.length < 2 || hasJapanese.test(trimmed)) return null
  let out: string | undefined = dictionary[trimmed]
  if (out === undefined) {
    let current = trimmed
    for (const [pattern, replacement] of jaPatterns) {
      current = current.replace(pattern, replacement)
    }
    if (current !== trimmed) out = current
  }
  if (out === undefined || out === trimmed) return null
  return text.replace(trimmed, out)
}

function isSkipped(element: Element | null): boolean {
  for (let el = element; el; el = el.parentElement) {
    if (SKIP_TAGS.has(el.tagName)) return true
    if (el.hasAttribute('data-no-i18n') || el.getAttribute('contenteditable') === 'true') return true
  }
  return false
}

function translateTextNode(node: Text): void {
  const value = node.nodeValue
  if (!value || isSkipped(node.parentElement)) return
  const next = translateDisplay(value)
  if (next !== null) node.nodeValue = next
}

function translateAttributes(element: Element): void {
  // 入力欄の文字そのものは触らないが、案内用の属性（placeholder など）は置き換える
  if (element.hasAttribute('data-no-i18n') || element.tagName === 'SCRIPT' || element.tagName === 'STYLE') return
  for (const name of ATTRIBUTES) {
    const value = element.getAttribute(name)
    if (!value) continue
    const next = translateDisplay(value)
    if (next !== null) element.setAttribute(name, next)
  }
}

function translateTree(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text)
    return
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return
  const element = root as Element
  if (SKIP_TAGS.has(element.tagName)) return
  translateAttributes(element)
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    translateTextNode(node as Text)
    node = walker.nextNode()
  }
  for (const child of element.querySelectorAll('[title],[aria-label],[placeholder],[alt]')) {
    translateAttributes(child)
  }
}

let started = false

/** 画面全体の監視を始める（二重起動しない）。ブラウザでだけ呼ぶこと。 */
export function startDomTranslation(): void {
  if (started || typeof document === 'undefined') return
  started = true

  const pending = new Set<Node>()
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    timer = null
    const batch = [...pending]
    pending.clear()
    for (const node of batch) {
      if (node.isConnected) translateTree(node)
    }
  }
  const schedule = (node: Node) => {
    pending.add(node)
    if (timer === null) timer = setTimeout(flush, 30)
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const added of mutation.addedNodes) schedule(added)
      } else if (mutation.type === 'characterData') {
        schedule(mutation.target)
      } else if (mutation.type === 'attributes') {
        schedule(mutation.target)
      }
    }
  })
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRIBUTES],
  })
  translateTree(document.body)
}
