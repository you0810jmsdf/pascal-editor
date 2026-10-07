import {
  BEARING_RATIOS,
  type BearingKind,
  buildDocument,
  collectKenchikuResults,
  DOCUMENTS,
  type DocumentId,
  type JpBuildingInput,
  type KenchikuResults,
  KenchikuScopeError,
} from '@nsfactory/kenchiku'
import type { JP_BEARING_KINDS } from '../agent-tools/kenchiku'
import { refuse } from '../agent-tools/refusal'
import { adaptJpBuilding } from '../kenchiku/adapter'
import type { AnyNode, WallNode } from '../schema'
import type { AgentOperation, SceneNodes } from './types'

type BuildingTarget = { buildingId?: string }

/** The adapter and the engine throw plain RangeErrors for scope and input problems; agents get a refusal. */
function computeInput(nodes: SceneNodes, buildingId?: string) {
  try {
    return adaptJpBuilding(nodes as Record<string, AnyNode>, buildingId)
  } catch (error) {
    if (error instanceof RangeError || error instanceof KenchikuScopeError)
      refuse('jp_not_computable', error.message, { buildingId: buildingId ?? null })
    throw error
  }
}

function compute(nodes: SceneNodes, buildingId?: string) {
  const adapted = computeInput(nodes, buildingId)
  try {
    return { adapted, results: collectKenchikuResults(adapted.value) }
  } catch (error) {
    if (error instanceof RangeError || error instanceof KenchikuScopeError)
      refuse('jp_not_computable', error.message, { buildingId: buildingId ?? null })
    throw error
  }
}

function structuralSummary(input: JpBuildingInput, r: KenchikuResults) {
  const required = r.required.value
  return {
    ok: r.existing.value.ok && r.quarter.value.ok,
    storeyCount: input.storeys.length,
    storeys: input.storeys.map((s) => ({
      index: s.index,
      floorArea: s.floorArea,
      height: s.height,
    })),
    requiredWall: {
      lw: required.lw,
      requiredCm: required.requiredCm,
      formula: r.required.explain.formula,
      substituted: r.required.explain.substituted,
    },
    wind: r.wind.value.rows.map((row) => ({
      storey: row.value.storey,
      direction: row.value.direction,
      facadeArea: row.value.facade.area,
      requiredCm: row.value.requiredCm,
    })),
    wallQuantity: r.existing.value.rows.map((row) => ({
      storey: row.value.storey,
      direction: row.value.direction,
      existingCm: row.value.existingCm,
      quakeCm: row.value.quakeCm,
      windCm: row.value.windCm,
      requiredCm: row.value.requiredCm,
      ratio: row.value.ratio,
      ok: row.value.ok,
    })),
    quarterMethod: r.quarter.value.rows.map((row) => ({
      storey: row.value.storey,
      direction: row.value.direction,
      ratios: row.value.ratios,
      wallRatio: row.value.wallRatio,
      ok: row.value.ok,
    })),
    nValues: {
      columnCount: r.nValues.value.rows.length,
      worst: r.nValues.value.rows
        .map((row) => ({
          columnId: row.value.column.id,
          storey: row.value.storey,
          n: row.value.governing.n,
          hardware: row.value.governing.hardware.symbol,
        }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 5),
      byHardware: Object.entries(
        r.nValues.value.rows.reduce<Record<string, number>>((acc, row) => {
          const key = row.value.governing.hardware.symbol
          acc[key] = (acc[key] ?? 0) + 1
          return acc
        }, {}),
      ).map(([symbol, count]) => ({ symbol, count })),
    },
    columns: r.columns.value.storeys.map((s) => ({
      storey: s.value.index,
      exteriorDeMm: s.value.exterior.value.de,
      interiorDeMm: s.value.interior.value.de,
      ratio: s.value.exterior.value.ratio,
    })),
    excluded: r.walls.value.storeys.map((s) => ({ storey: s.value.storey, ...s.value.excluded })),
    notes: r.existing.explain.notes ?? [],
  }
}

export const jpStructuralCheck: AgentOperation<BuildingTarget> = (nodes, input) => {
  const { adapted, results } = compute(nodes, input.buildingId)
  return {
    result: {
      ...structuralSummary(adapted.value, results),
      adapterNotes: adapted.explain.notes ?? [],
    },
  }
}

export const jpBuildingCodeCheck: AgentOperation<BuildingTarget> = (nodes, input) => {
  const { adapted, results } = compute(nodes, input.buildingId)
  const report = results.code.value
  return {
    result: {
      ok: report.ok,
      counts: report.counts,
      checks: report.checks.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        measured: c.measured ?? null,
        limit: c.limit ?? null,
        message: c.message,
        references: c.explain.references.map((ref) => ({
          law: ref.law,
          article: ref.article,
          url: ref.url,
        })),
      })),
      adapterNotes: adapted.explain.notes ?? [],
    },
  }
}

type SetWallBearingInput = {
  wallIds: string[]
  kinds?: (typeof JP_BEARING_KINDS)[number][]
  ratioOverride?: number
  faces?: 'one' | 'both'
  clear?: boolean
}

export const jpSetWallBearing: AgentOperation<SetWallBearingInput> = (nodes, input) => {
  if (!input.clear && !input.kinds?.length)
    refuse('jp_kinds_required', 'Pass kinds (e.g. ["panel-plywood"]) or clear: true.', {})
  const walls = input.wallIds.map((id) => {
    const node = nodes[id]
    if (!node)
      refuse('wall_not_found', `Wall not found: ${id}. Use an id get_walls returned.`, { id })
    if (node.type !== 'wall')
      refuse('not_a_wall', `Node ${id} is a ${node.type}, not a wall.`, { id, type: node.type })
    return node as WallNode
  })
  const kinds = (input.kinds ?? []).filter((k): k is BearingKind => k in BEARING_RATIOS)
  const needsRatio = kinds.some((k) => k === 'custom' || k === 'panel-other')
  if (!input.clear && needsRatio && input.ratioOverride === undefined)
    refuse('jp_ratio_required', 'custom / panel-other kinds need ratioOverride (壁倍率).', {
      kinds,
    })
  const update = walls.map((wall) => {
    const jp = { ...(wall.jp ?? {}) }
    if (input.clear) {
      const { bearing: _removed, ...rest } = jp
      return {
        id: wall.id,
        data: { jp: Object.keys(rest).length ? rest : undefined } as Partial<AnyNode>,
      }
    }
    return {
      id: wall.id,
      data: {
        jp: {
          ...jp,
          bearing: {
            kinds,
            ...(input.ratioOverride !== undefined ? { ratioOverride: input.ratioOverride } : {}),
            ...(input.faces ? { faces: input.faces } : {}),
          },
        },
      } as Partial<AnyNode>,
    }
  })
  const ratio = input.clear
    ? 0
    : Math.min(
        7,
        kinds.reduce(
          (sum, k) =>
            sum +
            (k === 'custom' || k === 'panel-other'
              ? (input.ratioOverride ?? 0)
              : BEARING_RATIOS[k]),
          0,
        ),
      )
  return {
    result: {
      updated: walls.map((w) => w.id),
      kinds: input.clear ? [] : kinds,
      ratio,
      message: input.clear
        ? `Cleared the bearing spec on ${walls.length} wall(s).`
        : `Set ${kinds.join('+')} (倍率 ${ratio}) on ${walls.length} wall(s). Run jp_structural_check to see the effect.`,
    },
    changes: { update },
  }
}

type GetDocumentInput = BuildingTarget & {
  doc: DocumentId
  buildingName?: string
  address?: string
  designer?: string
}

export const jpGetDocument: AgentOperation<GetDocumentInput> = (nodes, input) => {
  const { results } = compute(nodes, input.buildingId)
  const html = buildDocument(input.doc, results, {
    buildingName: input.buildingName,
    address: input.address,
    designer: input.designer,
  })
  const meta = DOCUMENTS.find((d) => d.id === input.doc)!
  return {
    result: {
      doc: input.doc,
      title: meta.title,
      basis: meta.basis,
      length: html.length,
      html,
    },
  }
}
