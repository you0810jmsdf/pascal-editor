import { deleteNode } from './delete-node'
import { duplicateLevel } from './duplicate-level'
import { findByType } from './find-by-type'
import { getNode } from './get-node'
import { jpBuildingCodeCheck, jpGetDocument, jpSetWallBearing, jpStructuralCheck } from './kenchiku'
import { getLevelSummary, getWalls, getZones } from './level-reads'
import { listLevels } from './list-levels'
import { fitStair, measureStairOperation } from './stairs'
import { verifyScene } from './verify-scene'

export * from './add-column'
export * from './add-object'
export * from './apply-changes'
export * from './collections'
export * from './delete-node'
export * from './door-clearance'
export * from './duplicate-level'
export * from './find-by-type'
export * from './get-node'
export * from './hosted-services'
export * from './kenchiku'
export * from './layout-clearance'
export * from './level-reads'
export * from './level-target'
export * from './list-levels'
export * from './material-preset'
export * from './plan-geometry'
export * from './scene-queries'
export * from './stairs'
export * from './types'
export * from './verify-scene'

/** Each shared agent tool's operation, by tool name: what every surface executes. */
export const AGENT_OPERATIONS = {
  measure_stair: measureStairOperation,
  fit_stair: fitStair,
  list_levels: listLevels,
  get_node: getNode,
  get_level_summary: getLevelSummary,
  get_walls: getWalls,
  get_zones: getZones,
  duplicate_level: duplicateLevel,
  verify_scene: verifyScene,
  delete_node: deleteNode,
  find_by_type: findByType,
  jp_structural_check: jpStructuralCheck,
  jp_building_code_check: jpBuildingCodeCheck,
  jp_set_wall_bearing: jpSetWallBearing,
  jp_get_document: jpGetDocument,
} as const
