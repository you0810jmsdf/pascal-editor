import { describe, expect, test } from 'bun:test'
import { IDBFactory } from 'fake-indexeddb'
import { MY_GLB_MAX_BYTES } from './my-glb-measure'
import {
  addMyItem,
  getMyItemFile,
  getMyItemThumb,
  listMyItems,
  MyItemsError,
  type NewMyItem,
  removeMyItem,
  updateMyItem,
} from './my-items-store'

const sample = (name = '自作の椅子'): NewMyItem => ({
  name,
  category: 'furniture',
  dimensions: [0.5, 0.9, 0.5],
  offset: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
})

const glb = (text = 'glb-bytes') => new Blob([text], { type: 'model/gltf-binary' })

describe('my-items-store', () => {
  test('登録した内容と GLB 本体が、別の接続（再読み込み相当）からも読み戻せる', async () => {
    const factory = new IDBFactory()
    const meta = await addMyItem(glb('中身A'), sample(), factory)
    expect(meta.id.startsWith('my-')).toBe(true)
    expect(meta.size).toBe(new Blob(['中身A']).size)

    // 接続を張り直して一覧・本体を読む
    const list = await listMyItems(factory)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ id: meta.id, name: '自作の椅子', dimensions: [0.5, 0.9, 0.5] })
    expect('file' in list[0]!).toBe(false)

    const file = await getMyItemFile(meta.id, factory)
    expect(file).not.toBeNull()
    expect(await file!.text()).toBe('中身A')
  })

  test('サムネイル画像は別に取り出せ、一覧には含まれず、削除で一緒に消える', async () => {
    const factory = new IDBFactory()
    const meta = await addMyItem(
      glb(),
      { ...sample(), thumbBlob: new Blob(['png-bytes'], { type: 'image/png' }) },
      factory,
    )
    expect('thumbBlob' in (await listMyItems(factory))[0]!).toBe(false)
    expect(await (await getMyItemThumb(meta.id, factory))!.text()).toBe('png-bytes')
    await removeMyItem(meta.id, factory)
    expect(await getMyItemThumb(meta.id, factory)).toBeNull()
    // サムネイル無しで登録した素材は null
    const bare = await addMyItem(glb(), sample('B'), factory)
    expect(await getMyItemThumb(bare.id, factory)).toBeNull()
  })

  test('一覧は登録が新しい順', async () => {
    const factory = new IDBFactory()
    const a = await addMyItem(glb(), sample('A'), factory)
    await new Promise((r) => setTimeout(r, 5))
    const b = await addMyItem(glb(), sample('B'), factory)
    expect((await listMyItems(factory)).map((i) => i.id)).toEqual([b.id, a.id])
  })

  test('削除すると登録も GLB 本体も消える。ほかの登録は残る', async () => {
    const factory = new IDBFactory()
    const a = await addMyItem(glb(), sample('A'), factory)
    const b = await addMyItem(glb(), sample('B'), factory)
    await removeMyItem(a.id, factory)
    expect((await listMyItems(factory)).map((i) => i.id)).toEqual([b.id])
    expect(await getMyItemFile(a.id, factory)).toBeNull()
    expect(await getMyItemFile(b.id, factory)).not.toBeNull()
  })

  test('存在しない id の削除・取得は落ちない', async () => {
    const factory = new IDBFactory()
    await removeMyItem('my-なし', factory)
    expect(await getMyItemFile('my-なし', factory)).toBeNull()
  })

  test('20MB 超と空の名前は拒否される（保存しない）', async () => {
    const factory = new IDBFactory()
    await expect(
      addMyItem(new Blob([new ArrayBuffer(MY_GLB_MAX_BYTES + 1)]), sample(), factory),
    ).rejects.toMatchObject({
      kind: 'too-large',
    })
    await expect(addMyItem(glb(), sample('   '), factory)).rejects.toBeInstanceOf(MyItemsError)
    expect(await listMyItems(factory)).toHaveLength(0)
  })

  test('updateMyItem は補正値と名前を直せるが、id・登録日・サイズは変えない', async () => {
    const factory = new IDBFactory()
    const meta = await addMyItem(glb(), sample(), factory)
    const updated = await updateMyItem(
      meta.id,
      { name: '直した名前', scale: [0.01, 0.01, 0.01], attachTo: 'wall' },
      factory,
    )
    expect(updated).toMatchObject({
      id: meta.id,
      name: '直した名前',
      attachTo: 'wall',
      createdAt: meta.createdAt,
      size: meta.size,
    })
    expect((await listMyItems(factory))[0]!.scale).toEqual([0.01, 0.01, 0.01])
    // 本体は残っている
    expect(await getMyItemFile(meta.id, factory)).not.toBeNull()
    expect(await updateMyItem('my-なし', { name: 'x' }, factory)).toBeNull()
  })
})
