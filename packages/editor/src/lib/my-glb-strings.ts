/**
 * N's factory: 「自分の GLB 家具の読み込み」画面の日本語辞書。
 * 既存の辞書（i18n-ja.ts など）は整形の規約に合っておらず、触ると全面整形になるため、
 * この機能の文言だけをここにまとめる。辞書に無い文言は、既存の t() に任せる。
 */
import { t } from './i18n'

const myGlbJa: Record<string, string> = {
  'Load my own GLB': '自分の GLB を読み込む',
  'My own models': '自分のモデル',
  'Models you load here stay only in this browser. They are not uploaded and not shared. Check the license of the files you use.':
    'ここで読み込んだモデルは、このブラウザの中にだけ保存されます。アップロードも共有もされません。使うファイルのライセンスはご自身で確認してください。',
  'Reading…': '読み込み中…',
  'Choose a .glb file': '.glb ファイルを選ぶ',
  'Could not save.': '保存できませんでした。',
  Close: '閉じる',
  Add: '追加',
  Name: '名前',
  Category: 'カテゴリ',
  Placement: '置き方',
  'On the floor': '床に置く',
  'On a wall': '壁に付ける',
  'On the ceiling': '天井に付ける',
  'Unit of the file': 'ファイルの単位',
  'Size (m): W {w} × H {h} × D {d}': '大きさ（m）：幅 {w} × 高さ {h} × 奥行 {d}',
  'Saved models': '保存したモデル',
  'Nothing saved yet.': 'まだありません。',
  'If you move a scene that uses these models to another device or browser, the models will not appear there.':
    'これらのモデルを使ったシーンを別の端末や別のブラウザへ移すと、そちらではモデルが表示されません。',
  'This scene uses it {n} time(s). If you delete it, those items will no longer be shown.':
    'このシーンで {n} 個使っています。削除すると、それらは表示されなくなります。',
}

// 上流のテストは英語の文言で照合するため、テスト実行中は翻訳しない（i18n.ts と同じ扱い）
const IS_TEST = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test'

/** この機能の文言を訳す。辞書に無ければ既存の t() に渡す。 */
export function tm(text: string): string {
  if (IS_TEST) return text
  return myGlbJa[text] ?? t(text)
}

/** `{name}` 形式の差し込みつき。 */
export function tmf(text: string, vars: Record<string, string | number>): string {
  return tm(text).replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match))
}
