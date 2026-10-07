// N's factory 静的版: 画面に出た英語を辞書で日本語に置き換える（外部プラグインや保存データの表示も含む）。
// 静的版以外では何もしない。仕組みは packages/editor/src/lib/dom-translate.ts を参照。
// React の初期化（ハイドレーション）が終わってから呼ぶこと（先に文字を書き換えると不整合になる）。
import { startDomTranslation } from '@pascal-app/editor/dom-translate'

export function startStaticDomI18n(): void {
  if (process.env.NEXT_PUBLIC_PASCAL_STATIC === '1') startDomTranslation()
}
