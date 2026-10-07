# Pascal MCP tool workflows

Source reviewed on 2026-09-08 against repository code whose package version field is `@pascal-app/mcp` 1.0.0-beta.6. This is not a claim that the package was published or natively host-tested. Installed and hosted releases may expose a different schema, so inspect the advertised tools first.

Inspect the server's advertised tools because hosted and local releases may differ. Never call a guessed tool.

## Inspect an existing project

1. `list_scenes`
2. `load_scene`
3. `get_project_status`
4. `list_levels`
5. `get_level_summary`, `get_walls`, `get_zones`, `find_nodes`, or `get_node`
6. `validate_scene`
7. `verify_scene`

`get_scene` returns the full graph and is useful when a compact summary omits a field needed for a calculation, such as an item's scale.

## Open a room scan (hosted only)

These three tools exist only on the hosted Pascal server. A local CLI connection does not advertise them, so inspect the advertised tools before assuming this path is available.

1. `list_captures`, optionally narrowed by `projectId`, `status`, or `limit`.
2. `get_capture` with the `captureId`, adding `includeScanMetrics` when the answer needs scan quality numbers.
3. `open_capture_as_project` once the capture reports `processed`, to bind the owning project's persisted draft into the session.
4. Continue with the project workflows above.

All three require edit access on the scan's own project; view access, including a public project owned by someone else, is refused as not found. The first two are read-only. `open_capture_as_project` creates nothing and is idempotent, but it carries the same non-read-only annotation as `get_project_status` because it changes the project the session is bound to.

## Create an editable project

1. `create_project`
2. `create_house_from_brief` for a supported quick start, or semantic construction tools for precise control
3. Add openings and furniture with semantic tools
4. `validate_scene`
5. `verify_scene`
6. `save_scene` with `saveMode: "draft"`
7. `get_project_status`

Use `checkpoint` only at a meaningful milestone. A browser-visible draft and a durable checkpoint are distinct states.

## Make a bounded edit

1. Read the target and its surrounding level.
2. Record the pre-edit project version or graph hash when available.
3. Apply one semantic edit. Use `apply_patch` only when necessary; its batch is atomic and forms one undo step.
4. Re-read the target and validate the scene.
5. Save and report the changed IDs.

If a live-sync version conflict occurs, call `load_scene`, inspect the newer graph, and rebase the requested edit. Do not retry an old whole-scene write blindly.

## Build a scripted object (hosted)

`add_object`, and `add_window`, `add_door` or `add_column` with `code` or new params on a scripted node, compile in the user's open Pascal editor tab of the project. When none is open the call answers `editor_tab_required` with `editorUrl` and `mutationApplied: false`; nothing changed. Show the user the link, wait until they confirm the tab is open, and repeat the same call. `editor_tab_timeout` means the tab stopped answering; ask whether it is still open, then retry. `script_failed` is the module's own error: fix the code.

## Read-only spatial answer

Do not mutate just to make a report unless the user authorizes a temporary or saved layout change. Use scene queries, `measure`, `check_collisions`, and `verify_scene`. Name the exact check and units. A plan-footprint check is not a detailed 3D, structural, regulatory, or delivery-path analysis.

## Outputs and limitations

- `export_json` returns the editable scene graph.
- `export_glb` in the open-source headless server currently reports `status: "not_implemented"`; protocol success is not artifact success.
- `photo_to_scene` needs host sampling. Without it, expect `sampling_unavailable`.
- `place_item` uses catalog dimensions. If a catalog item is unavailable, its placeholder dimensions are not evidence for a real product.
- `check_collisions` checks rotation-aware scaled item footprints using plan AABBs. Pass `minimumClearance` explicitly: zero reports overlap; a positive measurement also reports pairs closer than that gap. Inspect `status`, `checkedItems`, `skippedItems`, and `unsupportedChecks` before drawing a conclusion.
- `verify_scene` adds practical issues, including item separation and rectangular door-access keep-outs. It does not model a door-leaf swing arc or a delivery route.
- No tool starts a room scan or clones a scan into a new project. Scans are created only by the Pascal iOS app, and `open_capture_as_project` opens the scan's existing owning project.

When a requested deliverable is unsupported, return `partial` or `failed` with the tool status and the next supported action. Do not substitute an invented file, URL, or capability.

## Japanese building-code checks (jp_* tools, N's factory fork)

Available when the connected Pascal is the N's factory fork. They cover wooden post-and-beam houses up to two storeys under the 2025-04 rules (建築基準法施行令46条4項・告示1100号/1349号/1460号).

1. Mark bearing walls first: `jp_set_wall_bearing` with the wall ids from `get_walls` and a kind such as `panel-plywood` (構造用合板, ratio 2.5) or `brace-45x90` (筋かい, 2.0). Walls without a spec count as non-bearing.
2. Run `jp_structural_check`: it returns required wall quantity per storey (`requiredWall.lw`, cm per m²), wind requirement, existing wall quantity per storey and direction with pass/fail, the quarter-method balance, N-value hardware symbols and minimum column size. A refusal `jp_not_computable` names the missing input (for example no building, or a storey count outside phase A).
3. Run `jp_building_code_check` for site and room rules. Checks reported as `input-needed` wait for site facts (zoning, coverage ratios, roads) that a person enters in the editor's 建築法規 panel; do not invent them.
4. `jp_get_document` returns one printable HTML document (D1 wall quantity … D9 specification sheet). Hand the html to the person; every page states that it is a design reference and needs an architect's verification.
