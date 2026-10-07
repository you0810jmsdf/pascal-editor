import { expect, test } from 'bun:test'
import { BEARING_RATIOS, DOCUMENTS } from '@nsfactory/kenchiku'
import { JP_BEARING_KINDS, JP_DOCUMENT_IDS } from './kenchiku'

// 契約は zod だけに依存するため列挙を書き写している。エンジン側の表とずれたら落とす。
test('jp_set_wall_bearing の kinds は @nsfactory/kenchiku の BEARING_RATIOS と一致する', () => {
  // 'combined' は内部表現（複数 kinds を渡せば自動で併用になる）なので契約には出さない
  expect([...JP_BEARING_KINDS].sort()).toEqual(
    Object.keys(BEARING_RATIOS)
      .filter((k) => k !== 'combined')
      .sort(),
  )
})

test('jp_get_document の doc は図書一覧と一致する', () => {
  expect([...JP_DOCUMENT_IDS]).toEqual(DOCUMENTS.map((d) => d.id))
})
