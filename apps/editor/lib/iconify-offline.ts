// N's factory: アイコンを外部 API(api.iconify.design) から取らず、同梱の辞書から使う。
// 辞書は `node scripts/gen-icon-bundle.mjs` で生成する（lib/iconify-bundle.json）。
import { addCollection, type IconifyJSON } from '@iconify/react'
import bundle from './iconify-bundle.json'

for (const collection of bundle as unknown as IconifyJSON[]) addCollection(collection)
