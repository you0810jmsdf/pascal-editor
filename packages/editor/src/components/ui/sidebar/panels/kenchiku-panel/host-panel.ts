import type { Plugin } from '@pascal-app/core'
import type { EditorHostPanel } from '../../../../../lib/plugin-panels'

/** 日本の建築法規（木造の壁量計算・法規チェック・図書）。ノード種は持たず、パネルと計算だけを足す。 */
export const kenchikuPlugin: Plugin = {
  id: 'nsfactory:kenchiku',
  apiVersion: 1,
  nodes: [],
}

export const kenchikuHostPanel: EditorHostPanel = {
  id: 'nsfactory:kenchiku:panel',
  pluginId: 'nsfactory:kenchiku',
  label: '建築法規',
  description:
    '日本の建築基準法に沿った木造住宅の確認：壁量計算・四分割法・N値・柱の小径、敷地と居室の法規チェック、確認申請向けの図書（HTML）を作ります。参考値であり、確認申請には建築士の検証が必要です。',
  icon: { kind: 'iconify', name: 'lucide:scale' },
  component: () => import('./index'),
  creator: { name: "N's factory", url: 'https://you0810jmsdf.github.io/ns-factory/' },
  defaultInstalled: true,
}
