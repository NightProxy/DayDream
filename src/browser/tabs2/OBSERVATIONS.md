Your tabs system has solid module separation, but it's fighting the browser's layout engine with manual pixel math. Here's how I'd improve it without touching the code yet:

1. Replace absolute layout math with CSS Flexbox/Grid

layout.ts calculates widths, heights, positions, and overlaps by hand. Modern CSS can do this automatically. If the tab bar used display: flex with gap, you could delete tabContentWidths, tabContentPositions, tabContentHeights, and tabContentPositionsY entirely.
This also fixes the constant layout thrashing from renderGroupHeaders, which wipes and rebuilds every group header on every update.
2. Make groups actual DOM containers

Right now groups are loose tabs with an injected header element. If each group were a wrapper (.tab-group) containing its tabs, collapse/expand becomes a single CSS class toggle on the container instead of iterating tabIds to set display: none on individual tabs.
Drag-and-drop gets simpler: dropping a tab "into" a group means dropping it inside that container; dropping outside means moving it to the root tab bar.
3. Introduce an orientation strategy for vertical tabs

Instead of separate X/Y getters, create a LayoutStrategy interface with HorizontalStrategy and VerticalStrategy implementations. Both expose the same methods (e.g., getDropSide(e), getPrimarySize()), but one reads clientX/width and the other reads clientY/height.
For vertical mode, the tab bar becomes a sidebar (flex-direction: column, fixed width like 240px). The same drag handler can work for both axes if it calls into the active strategy rather than hardcoding e.clientX and rect.width.
4. Fix event listener leaks in drag.ts

setupSortable() recreates arrow functions and tries to removeEventListener with them, but arrow functions are new references every call, so the old listeners are never removed. Store handlers in a WeakMap<Element, HandlerSet> so you can detach the actual previous listeners.
5. Move magic numbers and session logic out of the god class

The Tabs class still carries session serialization and layout orchestration. Move saveSession/restoreSession into a SessionManager module.
Move hardcoded constants (overlap 1, padding 9, max width 240, etc.) into a single config object or CSS custom properties so vertical/horizontal modes can share them.
6. Small bugs to note

pin.ts:51 has .pinnned (three n's), so pinnedTabEls will always return an empty array.
manipulation.ts duplicates drag logic that already exists in drag.ts; consolidate moveTabToPosition.

1. Container-based groups with FLIP animation Make each group a real DOM container, not loose tabs with an injected header:

<div class="tab-group" data-group-id="g1" style="--group-color: #3B82F6;">
  <div class="tab-group-header">Group Name</div>
  <div class="tab-group-tabs">
    <div class="tab">...</div>
    <div class="tab">...</div>
  </div>
</div>
This lets the tab bar be a flex container of groups and ungrouped tabs. Chrome's tab sliding is just flex order changes with CSS transform transitions. Use a FLIP pattern (First, Last, Invert, Play): read tab positions before reordering, write the new DOM order, calculate position deltas, apply negative transforms, then animate transforms to zero. Replace TabLayout's manual pixel math entirely.

2. Single global drop indicator Instead of injecting #drop-indicator into tab elements (which conflicts with relative positioning), create one persistent indicator element that you absolutely-position between tabs using the flex layout metrics. Chrome uses a thin vertical line that snaps to tab gaps.

3. Ghost/drag image layer Don't drag the real tab element. On dragstart, create a detached clone at position: fixed under the cursor via setDragImage or a custom pointer-follower. The original tab stays in the strip, preserving layout until drop. This eliminates the need for drag-ghost cleanup and draggabilly workarounds.

4. Unified drag model: tabs vs groups

Dragging a tab inside its group: reorder within the group's flex container.
Dragging a tab to another group: append to that group's container; no manual groupId juggling.
Dragging a tab to the tab bar root: move it out of any group container.
Dragging a group header: the entire .tab-group gets draggable=true; on drop, you reorder the group container itself in the tab bar. All tabs move atomically without individual index math.
5. Better ungrouping logic Kill the edge-threshold math (shouldUngroupBasedOnPosition). Instead:

Dragging a tab out of its group container naturally ungroups it (the container is the boundary).
Or show a dedicated "Ungroup" item in the drag-preview context when the tab is dragged more than ~50px away from the group axis.
6. Group creation via drop Chrome auto-creates groups when you drop a tab onto another tab. Add this to handleEnhancedDrop: if draggedTab and targetTab are both ungrouped and the drop is a "merge" intent (short distance, held briefly), call createGroupWithTab(targetTab.id) then addTabToGroup(draggedTab.id, newGroupId).

7. Collapse as container width animation Instead of toggling display: none on each tab (which breaks drag handlers and causes reflow), collapse the group by giving .tab-group a collapsed class that sets .tab-group-tabs to width: 0; overflow: hidden; opacity: 0; with transition. The header stays visible as a compact pill.

8. Fix the listener leak Store handlers per-element in a WeakMap so setupSortable() can actually remove old listeners before re-adding them. Right now you're orphaning listeners every call.

Quick win: If you do only one thing, switch to container-based groups with flex layout. It collapses drag.ts from 1000 lines to ~300 because group moves become container moves and tab insertion points become flex child indices.