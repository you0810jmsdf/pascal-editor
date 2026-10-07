import { checkBuildingCode } from '../code-check'
import type { JpBuildingInput } from '../model'
import { columnSizes } from '../structural/column-size'
import { existingWall } from '../structural/existing-wall'
import { nValues } from '../structural/n-value'
import { quarterMethod } from '../structural/quarter-method'

/** 図書が参照する計算結果の束。UI もこれを1回計算してタブと図書で共有する。 */
export function collectKenchikuResults(input: JpBuildingInput) {
  const existing = existingWall(input) // 中で requiredWall・windWall・bearingWalls も計算する
  return {
    input,
    existing,
    required: existing.value.quake,
    wind: existing.value.wind,
    walls: existing.value.walls,
    quarter: quarterMethod(input),
    nValues: nValues(input),
    columns: columnSizes(input),
    code: checkBuildingCode(input),
  }
}

export type KenchikuResults = ReturnType<typeof collectKenchikuResults>
