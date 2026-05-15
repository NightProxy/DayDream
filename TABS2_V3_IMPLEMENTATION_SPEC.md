# Tabs2 V3 Implementation Spec (AI Handoff)

## Purpose
This document is a build spec for the next AI model to implement the Tabs V3 system in `src/browser/tabs2`.

No code is included in this document. This is implementation guidance only.

## Context Snapshot (as of May 15, 2026)

### Notion references (Daydream)
- Redo Tabs System Entirely (OR Fix Nightmare to have React Compat)
  - URL: https://www.notion.so/30166796ccd680b0a8bbcfc82f3cc9d7
  - Status: `In Progress`
  - Priority: `High`
  - Version: `V3`
- Vertical Tabs integration
  - URL: https://www.notion.so/30166796ccd68056b6ecffb5a786f1a9
  - Status: `In Progress`
  - Priority: `Medium`
  - Version: `V3`
- Better Iframe Client Polyfill injection
  - URL: https://www.notion.so/34a66796ccd680b7b98eed31a4f01c1e
  - Status: `Backlog`
  - Priority: `Medium`
  - Version: `V3`
- Split Screen feature
  - URL: https://www.notion.so/34e66796ccd68093b948fa4e529767f3
  - Status: `Backlog`
  - Priority: `Medium`
  - Version: `V3`

Note: each task page is currently blank in Notion body content, so this spec is the authoritative detail for execution.

## Goals
1. Implement Chrome-like tab pinning behavior for Tabs2.
2. Implement tab grouping with group headers, collapsible groups, and drag interactions.
3. Implement drag-and-drop using dnd-kit sortable primitives.
4. Keep behavior consistent in horizontal and vertical tabs modes.
5. Refactor frame creation out of tab lifecycle into a dedicated frame manager.
6. Expand iframe page client to provide browser-like right-click actions (starting with link context actions).

## Hard Behavioral Requirements

### Pinning
- Pinned tabs use: `Nightmare.setState(tab, "pinned")`.
- Pinned tabs must always be rendered first in the tab strip.
- Vertical mode: pinned tabs are still first, just visually above non-pinned tabs.
- Pinned tabs cannot remain grouped.
- If user groups a pinned tab via context menu, auto-unpin first, then add to group.
- If user drags pinned tab into a group, auto-unpin first, then group.
- Multiple pinned tabs can be reordered among pinned tabs only.
- Pinned tabs cannot be dropped into unpinned or grouped “middle” positions unless unpinned by explicit conversion logic.

#### Pinning operation contract
- `pinTab(tabId)`:
  - remove tab from any existing group
  - set `isPinned = true`
  - set `groupId = undefined`
  - apply pinned visual state with `setState(tab, "pinned")`
  - insert/reorder tab inside pinned lane only
- `unpinTab(tabId)`:
  - set `isPinned = false`
  - clear pinned visual state
  - insert tab into ungrouped lane (unless part of a conversion action that immediately groups it)
- `togglePin(tabId)` should route to `pinTab`/`unpinTab` and never mutate flags ad-hoc.

#### Pinning edge case behavior
- Pin action on already pinned tab: no-op.
- Pin tab while tab is in collapsed group: remove from group without forcing group expand.
- Close pinned tab: only remove that tab; keep pinned lane stable.
- Reordering pinned tabs must never move them below unpinned/grouped lanes.

### Grouping
- Group creation is initiated from tab context menu “Create/Add to New Group” on a specific tab.
- Group creation moves only that selected tab into the new group (no auto-including neighbors).
- Group headers are shown before each group (Chrome-style grouping line/pill behavior per design references).
- Group collapse state uses: `setState(tabgroup, "collapsed")`.
- Collapsed groups hide member tabs but keep header visible.
- User can reorder groups by dragging group headers.
- Tabs can be moved between groups by drag.
- Ungrouped tabs can be dragged into a group.
- If grouped tab is dragged out and not dropped into another group, it becomes ungrouped.

#### Group operation contract
- `createGroupWithTab(tabId)`:
  - if pinned, unpin first
  - create group with one member only: the selected tab
  - assign group defaults (name/color/isCollapsed=false)
- `addTabToGroup(tabId, groupId, targetIndex?)`:
  - if pinned, unpin first
  - remove from previous group if needed
  - insert into target group at provided index or append
- `removeTabFromGroup(tabId)`:
  - remove from source `group.tabIds`
  - clear `tab.groupId`
  - place into ungrouped lane deterministically
- `deleteGroup(groupId)`:
  - preserve tabs as ungrouped tabs by default
  - remove group entry
- `ungroupAllTabs(groupId)`:
  - preserves tab order while moving tabs to ungrouped lane
- `toggleGroupCollapse(groupId)`:
  - flip `isCollapsed`
  - use `setState(tabgroup, "collapsed")` for collapsed visuals

#### Group ordering rules
- Group order is controlled by `groups[]` index order only.
- Tab order inside a group is controlled by `group.tabIds`.
- Moving tabs between groups must not reorder unrelated groups.

### Drag rules summary
- Pinned zone and non-pinned zone are logically distinct.
- Grouped, ungrouped, and pinned moves must obey invariant constraints:
  - `Pinned` tabs do not remain inside groups.
  - `Grouped` tab must map to exactly one group ID.
  - `Ungrouped` tab has no group ID.
- Invalid drop attempts should be converted (e.g., pinned->group => unpin+group) or rejected with no-op, per rules below.

## Current Codebase Notes

### Tabs2 modules that already exist
- `src/browser/tabs2/index.ts`
- `src/browser/tabs2/lifecycle.ts`
- `src/browser/tabs2/manipulation.ts`
- `src/browser/tabs2/contextMenu.ts`
- `src/browser/tabs2/pageClient.ts`
- `src/browser/tabs2/metaWatcher.ts`
- `src/browser/tabs2/historyIntegration.ts`
- `src/browser/tabs2/types.ts`

### Legacy tabs modules useful as reference
- `src/browser/tabs/group.ts`
- `src/browser/tabs/pin.ts`
- `src/browser/tabs/drag.ts`
- `src/browser/tabs/layout.ts`

Do not copy legacy architecture 1:1. Tabs2 should use cleaner state boundaries and dnd-kit-based drag.

### Nightmare integration note
NightmarePlugins were merged into Nightmare package.
- Main object now exposes menu systems on `ui` (`rightclickmenu`) and `ui.np` polyfill.
- New Tabs2 code should not hard-bind to deprecated plugin paths.

## Data Model Specification

Extend/standardize `TabData` and `TabGroup` model usage in `tabs2/types.ts`:

- `TabData`
  - `id`
  - `groupId?: string`
  - `isPinned: boolean`
  - existing frame/title/url metadata remains
- `TabGroup`
  - `id`
  - `name`
  - `color`
  - `isCollapsed`
  - `tabIds: string[]`

Add derived selectors (implemented wherever state utilities live):
- `getPinnedTabs()`
- `getUngroupedUnpinnedTabs()`
- `getGroupTabs(groupId)`
- `getVisualTabOrder(mode)` where mode horizontal/vertical only affects rendering orientation, not data semantics.

## Rendering Model
Use a three-zone rendering concept:
1. Pinned zone
2. Group zones (each with header + group member tabs)
3. Ungrouped unpinned zone

A canonical render order should be deterministically derived from state, not inferred from stale DOM positions.

## State Invariants (must always hold)
1. A pinned tab must have `groupId === undefined`.
2. A grouped tab must have exactly one owning group and appear once in that group’s `tabIds`.
3. No duplicate tab IDs across pinned/grouped/ungrouped output.
4. Each tab ID in `groups[].tabIds` must resolve to existing tab.
5. Collapsed group does not remove tabs from state, only hides them from visible list.
6. No pinned tab may exist in any `group.tabIds`.
7. Every grouped tab must appear once in exactly one group list.
8. `groups[]` index order is the single source of truth for rendered group order.

Implement a debug-time invariant checker utility and run it after complex mutations in development mode.

### Invariant checker stages
- Stage 1: validate tab existence for all `group.tabIds`.
- Stage 2: build reverse membership map (`tabId -> groupId`) and detect duplicates.
- Stage 3: assert no `isPinned && groupId`.
- Stage 4: validate derived render lists have no duplicate draggable IDs.

## Context Menu Spec

### Tab menu entries (minimum)
- New tab to the right
- Add tab to new split view (stub/disabled if not implemented yet)
- Add tab to group >
  - New group
  - Existing groups list
- Remove from group (only when grouped)
- Move to new window (optional stub)
- Reload
- Duplicate
- Pin / Unpin
- Close
- Close other tabs
- Close tabs to the right

### Group-aware behaviors
- If tab is pinned and user chooses group action:
  - auto `unpin`
  - then apply group action
- For grouped tab, menu should expose remove/move/rename/color/toggle collapse/delete group actions where appropriate.

### Group header context menu
Include header-level actions:
- Rename group
- Change color
- Collapse/Expand
- Ungroup all tabs
- Delete group (preserving tabs as ungrouped unless product decision says close)
- Close all tabs in group (if desired)

## Drag & Drop Spec (dnd-kit)

### Library
Use `@dnd-kit/core` + `@dnd-kit/sortable`.
Reference concept docs: https://dndkit.com/concepts/sortable/

### Draggables
- Tab draggable: `draggableId = tab:{tabId}`
- Group header draggable: `draggableId = group:{groupId}`

### Drag payload (normalized)
- `kind`: `tab` | `group`
- `tabId?`
- `groupId?`
- `sourceLane`: `pinned` | `ungrouped` | `group:{id}` | `groups-order`
- `sourceIndex`
- `isPinned?`

### Droppables
- Pinned lane drop targets
- Group header drop targets for group reordering
- Group body drop targets for tab insertion into group
- Ungrouped lane drop targets
- Optional per-tab insertion targets for precise index placement

### Drop target payload (normalized)
- `kind`: `lane` | `tab` | `groupHeader` | `groupBody`
- `laneId`: `pinned` | `ungrouped` | `group:{id}` | `groups-order`
- `anchorTabId?`
- `insertMode`: `before` | `after` | `inside`

### Drag outcome resolver
Implement centralized resolver:
- Input: active item type/id, over target type/id, pointer position metadata
- Output: one mutation action object

Action types (examples):
- `REORDER_PINNED`
- `MOVE_PINNED_TO_GROUP` (auto unpin)
- `MOVE_TAB_TO_GROUP`
- `MOVE_TAB_OUT_OF_GROUP`
- `MOVE_TAB_BETWEEN_GROUPS`
- `REORDER_GROUPS`
- `REORDER_UNGROUPED`
- `REORDER_WITHIN_GROUP`

Do not mutate state inside sensor callbacks directly. Compute then commit one transaction.

### Resolver flow (mandatory)
1. Parse active + over payloads into semantic source/target.
2. Reject incompatible kind combos early.
3. Determine intent:
  - reorder in-lane
  - move cross-lane
  - pinned-to-group conversion
  - grouped-to-ungrouped ungroup action
4. Build one canonical action.
5. Commit action in one reducer transaction.
6. Run invariants; if invalid, rollback to pre-action snapshot and no-op.

### Action semantics (precise)
- `REORDER_PINNED(tabId, toIndex)`
- `REORDER_UNGROUPED(tabId, toIndex)`
- `REORDER_WITHIN_GROUP(tabId, groupId, toIndex)`
- `MOVE_TAB_TO_GROUP(tabId, toGroupId, toIndex?)`
- `MOVE_TAB_BETWEEN_GROUPS(tabId, fromGroupId, toGroupId, toIndex?)`
- `MOVE_TAB_OUT_OF_GROUP(tabId, fromGroupId, toUngroupedIndex?)`
- `MOVE_PINNED_TO_GROUP(tabId, toGroupId, toIndex?)` (forced unpin conversion)
- `REORDER_GROUPS(groupId, toIndex)`

### Required drag behaviors
- Pinned among pinned: reorder allowed.
- Pinned into non-pinned lane: reject unless converting via explicit unpin action path.
- Pinned into group: auto-unpin then insert into target group.
- Grouped to another group: move between groups.
- Grouped out to ungrouped: clear groupId and remove from old group list.
- Ungrouped into group: add to group.
- Group header drag: reorder whole group blocks.

### Explicit drag decision matrix
- Pinned tab -> pinned lane/tab: reorder pinned.
- Pinned tab -> ungrouped lane/tab: reject by default (unless product explicitly allows auto-unpin for this path).
- Pinned tab -> group body/tab: auto-unpin, then insert into group.
- Grouped tab -> same group: reorder within group.
- Grouped tab -> other group: move between groups.
- Grouped tab -> ungrouped lane: ungroup.
- Ungrouped tab -> group body: group add.
- Ungrouped tab -> ungrouped lane/tab: reorder ungrouped.
- Group header -> groups-order lane: reorder groups.
- Group header -> tab/groupBody lanes: no-op.

### Collapsed-group drag behavior
- Collapsed group exposes header/body drop only, not child-tab anchors.
- Dropping into collapsed group inserts at deterministic boundary (end preferred).
- Prevent live collapse/expand during active drag to avoid target jitter.

### Collision strategy
Use dnd-kit collision strategy that feels stable with horizontal tab strips (`closestCenter` or tuned custom strategy). For vertical tabs, ensure the same resolver works with axis-appropriate position calculations.

### Sensors, axis, and overflow
- Mouse sensor with activation distance to avoid accidental drags from clicks.
- Touch sensor with press delay if touch support is needed.
- Horizontal mode prioritizes X-axis insertion heuristics.
- Vertical mode prioritizes Y-axis insertion heuristics.
- Auto-scroll should activate near strip edges for overflowed tab lanes and group header drags.

## Vertical Tabs Behavior
- Existing vertical toggle in Tabs2 remains entry point.
- Same state rules as horizontal.
- Rendering axis changes only layout and drag direction ergonomics.
- Pinned still first, then groups, then ungrouped tabs.

## Frame Management Refactor (New Module)

### Problem
`tabs2/lifecycle.ts` currently creates iframes and proxy frames directly. This mixes lifecycle orchestration with low-level frame concerns.

### Target
Create a dedicated module under `tabs2` (name suggestion: `frameManager.ts`) responsible for:
- iframe element creation
- proxy frame creation/binding
- iframe preprocessing hooks (polyfills, sandbox attrs, feature flags)
- frame cleanup and teardown
- split-screen placement metadata and container targeting

### Proposed API
- `createManagedFrame(tabId, url, placement)` -> returns `{ iframe, frameId, proxyHandle }`
- `attachFrame(tabId, container)`
- `navigateFrame(tabId, url)`
- `cleanupFrame(tabId)`
- `setFramePlacement(tabId, splitPlacement)`

Lifecycle module should call this manager, not own frame internals.

## Split Screen Roadmap Integration
Split placement exists in tab type (`split-left`, `split-right`, etc.).
Use frame manager as integration point for:
- allocating frame containers
- switching tab frame between main/split panes
- future resizing/persistence hooks

Do not tightly couple split behavior to tab header rendering.

## Iframe Client / PageClient Spec

### Goal
Expand `tabs2/pageClient.ts` to provide browser-like context behavior and polyfill bridge.

### Required first feature
Right-click link in iframe content should allow host-browser actions, including:
- Open link in new tab
- Open link in new split view (if supported)
- Copy link address

### Architecture direction
- Inject listener bridge in iframe context (or via existing proxy/page client channel).
- When iframe contextmenu event hits actionable target (`a[href]`), post structured message to host.
- Host renders Nightmare right-click menu with browser actions.
- Host actions call Tabs2 APIs (`createTab`, split open path, clipboard utility).

### Message contract (example)
- From iframe to host:
  - `type: "iframe-context-link"`
  - `tabId`
  - `href`
  - `text`
  - pointer coordinates
- Host response/actions:
  - perform action + optional ack for UX

## Migration Plan (Execution Order)
1. Stabilize Tabs2 state helpers and invariants.
2. Implement pin manager for Tabs2 semantics + context menu pin/unpin correctness.
3. Implement group manager with collapse, rename/color, CRUD.
4. Implement deterministic renderer for pinned/groups/ungrouped zones.
5. Integrate dnd-kit drag resolver for tabs and group headers.
6. Refactor frame creation into frame manager and update lifecycle.
7. Extend pageClient for iframe link context menus.
8. Add split-screen hooks in frame manager (minimum scaffolding).
9. Add regression tests and manual QA pass.

## Testing Checklist

### Unit/state tests
- Pin/unpin transitions preserve invariants.
- Group create/delete/rename/collapse operations maintain membership integrity.
- Drag resolver outputs correct action for each source/target combination.
- Auto-unpin on grouping actions works for both context menu and drag pathways.

### Integration/UI tests
- Pinned tabs always render first in horizontal and vertical modes.
- Group header collapse with `setState(tabgroup, "collapsed")` correctly hides member tabs.
- Group reorder by header drag works and persists in state.
- Dragging grouped tab out of group ungroups when dropped in ungrouped zone.
- Dragging grouped tab into another group moves group membership.
- Link right-click inside iframe opens host context menu and actions execute.

### Manual QA scenarios
- Mixed set: multiple pinned + multiple groups + ungrouped tabs.
- Attempt illegal drops and confirm conversion/rejection behavior.
- Close tabs while grouped/pinned and confirm state cleanup.
- Toggle vertical mode during mixed state and verify ordering is unchanged semantically.

## Performance and Safety Notes
- Avoid full tabbar DOM teardown on each state change; prefer keyed reorder rendering.
- Debounce expensive layout reads during drag overlays.
- Clean listeners on tab close/group delete/frame teardown.
- Guard against stale tab IDs in async handlers.

## Non-Goals (for this phase)
- Full multi-window tab migration implementation.
- Advanced split-screen UI polish beyond wiring and frame manager hooks.
- Persisted session schema redesign unless needed for new fields.

## Deliverables for Next AI
1. Updated Tabs2 implementation with pin/group/drag behavior described above.
2. dnd-kit integrated for tab and group header sorting.
3. New frame manager module and lifecycle integration.
4. Page client link context menu bridge.
5. Updated tests and/or validation scripts.
6. Brief implementation report mapping completed behavior to this spec.
