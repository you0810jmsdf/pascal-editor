# Kenchiku (Japanese building code)

*The Pascal-free building-code engine, the scene adapter, the editor panel and the agent tools that share it.*

Applies to: `packages/kenchiku/**`, `packages/core/src/kenchiku/**`, `packages/core/src/agent-tools/kenchiku.ts`, `packages/core/src/agent-operations/kenchiku.ts`, `packages/editor/src/components/ui/sidebar/panels/kenchiku-panel/**`, `packages/editor/src/components/editor-2d/renderers/floorplan-kenchiku-layer.tsx`, `packages/editor/src/store/use-kenchiku.ts`.

This is an N's factory addition to the fork. The specification (in Japanese) is `docs/nsfactory/kenchiku-spec.md`; primary sources and research notes live outside the repository.

## Boundary

```
@nsfactory/kenchiku  (packages/kenchiku)   ← pure TypeScript, no Pascal import, zod only
        ▲
packages/core/src/kenchiku/adapter.ts      ← scene graph → JpBuildingInput (the only Pascal-aware code)
        ▲                      ▲
agent-operations/kenchiku.ts   editor panel + 2D layer (useKenchiku store)
        ▲
packages/mcp shared tools
```

- **E-001 extension.** `kenchiku` is the lowest layer; `core` may import it. It never imports `@pascal-app/*`, so a future learning app can use it as-is.
- **Results carry their explanation.** Every number is `Explained<T> = { value, explain: { formula, substituted, references, notes?, steps? } }`. References point at e-Gov law pages or the MLIT notice PDFs with the effective date (`2025-04-01`).
- **Knowledge tables are data with provenance** (`packages/kenchiku/src/knowledge/`): loads and wall ratios from the official spreadsheet tool the Ministry endorses (HOWTEC, 2025-12), N-value hardware from 告示1460号, timber strengths, and the article references used by every check. Changing a number means recording where it came from.

## Input model

`JpBuildingInput` (`packages/kenchiku/src/model.ts`): storeys (height, wall-centerline floor polygon and area, walls with openings and an optional bearing spec, rooms, stairs, columns), roof (kind, rise, overhang, pitch in 寸), finishes and insulation, `c0`, wind coefficient, timber, and an optional `site` (polygon, true north, zoning and the other facts a person enters). Coordinates are building-local metres rotated so the walls' principal direction is the X axis (`dominantAxisAngle`; the angle travels as `axisRotation` and the 2D overlay rotates back), `x` = X direction, `y` = Pascal's `z`. The site polygon and true north are moved into the same frame, so the site checks hold for a building that is placed or rotated on its lot.

The adapter (`adaptJpBuilding`) fills it from the scene: occupied storeys of one building in base-elevation order (`jpStoreyLevels`), walls normalised to their centerline (`wall-frame`), the floor polygon from `room-graph`, openings from the wall children (`position[0]` is the centre along the wall), rooms from zones with `spaceRole: 'room'` or a `jp.roomKind`, stairs through `measureStair`, roof facts from the roof segments or the `jp.*Override` fields. Missing finishes fall back to defaults and are reported in `explain.notes`; a building that is out of phase A scope (not wood-conventional, more than three storeys) throws a `RangeError` the operations turn into an `AgentRefusal`.

## Persisted fields

All optional, all under a `jp` key, so old scenes parse unchanged (E-003): `SiteNode.jp` (zoning, coverage ratios, roads, fire zone, height limits, C0, wind, snow, energy region, authority), `BuildingNode.jp` (structure, roof and wall kinds, PV, insulation, use, roof overrides, timber, bearing-wall minimum length, quasi walls), `WallNode.jp` (`bearing: { kinds, ratioOverride?, faces?, quasi? }`, `exterior?`), `ZoneNode.jp` (`roomKind`, `daylightNeighborDistance`). Schemas: `packages/core/src/kenchiku/schema.ts`.

## Calculations (phase A)

Required wall quantity from loads (`requiredWall`), wind (`windWall`), bearing segments and existing wall quantity (`bearingWalls`, `existingWall`), the quarter method (`quarterMethod`), N-values (`nValues`), column size (`columnSizes`), the non-structural checks (`checkBuildingCode`), the reference-only estimates (`referenceChecks`: eccentricity, beam depth guide, foundation bearing pressure — printed in a separate 参考 chapter, never part of a verdict) and the nine printable documents (`buildDocument`). `collectKenchikuResults(input)` runs them once; the panel, the documents and the agent tools share that bundle.

## Surfaces

- **Editor**: host panel `nsfactory:kenchiku:panel` (registered in `apps/editor/lib/bootstrap.ts`, `defaultInstalled`), tabs 設定 / 耐力壁 / 結果 / 図書. Computation is explicit (計算する); `useKenchiku` keeps the results with the node table they were computed from, so a later edit shows as 古い結果. The 2D layer draws the bearing segments of the viewed storey; 3D has no counterpart yet (reported, E-006).
- **Agents**: `jp_structural_check`, `jp_building_code_check`, `jp_set_wall_bearing`, `jp_get_document` — contracts, operations and MCP registration follow [agent-surfaces](agent-surfaces.md); the shared cases are `agent-operations/__fixtures__/kenchiku-cases.ts`.

## Tests

- `packages/kenchiku`: the official tool's worked example and derived vectors (`src/__fixtures__/kenchiku_vectors.json`, generated by `docs/nsfactory/tools/kenchiku_oracle.py`), hand-calculated segment, quarter-method, N-value and code-check boundary cases, document generation.
- `core`: adapter on the fixture house (`src/kenchiku/__fixtures__/wood-two-storey.ts`), schema round trips, the shared agent cases through the core and MCP runners.
- Workspace packages resolve each other through `dist/`: after changing a public API of `kenchiku` or `core`, run `bun run build` in that package before `bun test <filter>` (turbo's `test` does this for you; a direct `bun test` does not).

## Out of scope for now

Three-storey or steel/RC buildings (phase B/C), a 3D counterpart of the bearing-wall overlay, shadow diagrams, sky factor, GIS import of zoning data.
