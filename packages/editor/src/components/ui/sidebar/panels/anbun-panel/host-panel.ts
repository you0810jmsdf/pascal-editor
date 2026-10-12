import type { Plugin } from '@pascal-app/core'
import type { EditorHostPanel } from '../../../../../lib/plugin-panels'

/** 家事按分（私用と事業の利用割合）。部屋ごとの区分と内法の面積から按分率と根拠表を作る。ノード種は持たない。 */
export const anbunPlugin: Plugin = {
  id: 'nsfactory:anbun',
  apiVersion: 1,
  nodes: [],
}

export const anbunHostPanel: EditorHostPanel = {
  id: 'nsfactory:anbun:panel',
  pluginId: 'nsfactory:anbun',
  label: '家事按分',
  description:
    '部屋ごとに「事業用／私用／共用」を付け、部屋の内側（内法）の面積から、私用と事業の利用割合（按分率）を計算します。確定申告の根拠表（CSV・印刷）を出せます。計算の補助であり、按分方法の妥当性は税務署・税理士の判断です。',
  icon: { kind: 'iconify', name: 'lucide:percent' },
  component: () => import('./index'),
  creator: { name: "N's factory", url: 'https://you0810jmsdf.github.io/ns-factory/' },
  defaultInstalled: true,
}
