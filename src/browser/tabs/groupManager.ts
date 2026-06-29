import type { TabData, TabGroup, TabsInterface } from './types';

const DEFAULT_GROUP_COLORS = [
	'#EF4444',
	'#F97316',
	'#EAB308',
	'#22C55E',
	'#06B6D4',
	'#3B82F6',
	'#8B5CF6',
	'#EC4899'
];

const createGroupId = (): string => {
	return `group-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
};

export class TabGroupManager2 {
	private tabs: TabsInterface;

	constructor(tabs: TabsInterface) {
		this.tabs = tabs;
	}

	private getDefaultColor = (): string => {
		const index =
			this.tabs.getGroups().length % DEFAULT_GROUP_COLORS.length;
		return DEFAULT_GROUP_COLORS[index];
	};

	private getUngroupedInsertionIndex = (): number => {
		return (
			this.tabs.getPinnedTabs().length +
			this.tabs.getGroups().reduce((acc, group) => {
				return acc + group.tabIds.length;
			}, 0)
		);
	};

	private removeTabFromOwningGroup = (tab: TabData): void => {
		if (!tab.groupId) {
			return;
		}

		const currentGroup = this.tabs.getGroupById(tab.groupId);
		if (!currentGroup) {
			tab.groupId = undefined;
			return;
		}

		currentGroup.tabIds = currentGroup.tabIds.filter(id => id !== tab.id);
		tab.groupId = undefined;

		if (currentGroup.tabIds.length === 0) {
			this.tabs.groups = this.tabs
				.getGroups()
				.filter(g => g.id !== currentGroup.id);
		}
	};

	private assignTabToGroup = (
		tab: TabData,
		group: TabGroup,
		targetIndex?: number
	): void => {
		const currentIndex = group.tabIds.indexOf(tab.id);
		if (currentIndex !== -1) {
			group.tabIds.splice(currentIndex, 1);
		}

		const insertionIndex =
			typeof targetIndex === 'number'
				? Math.max(0, Math.min(targetIndex, group.tabIds.length))
				: group.tabIds.length;

		group.tabIds.splice(insertionIndex, 0, tab.id);
		tab.groupId = group.id;
	};

	createGroupWithTab = (tabId: string): string | null => {
		const tab = this.tabs.getTabById(tabId);
		if (!tab) {
			return null;
		}

		const groupId = createGroupId();
		const groupName = `Group ${this.tabs.getGroups().length + 1}`;

		this.tabs.runStateTransaction('create-group-with-tab', () => {
			if (tab.isPinned) {
				this.tabs.pinManager?.unpinTab(tabId);
			}

			this.removeTabFromOwningGroup(tab);

			const group: TabGroup = {
				id: groupId,
				name: groupName,
				color: this.getDefaultColor(),
				isCollapsed: false,
				tabIds: [tabId]
			};

			tab.groupId = groupId;
			this.tabs.registerGroup(group);
			this.tabs.syncTabVisualState(tabId);
		});

		return groupId;
	};

	addTabToGroup = (
		tabId: string,
		groupId: string,
		targetIndex?: number
	): boolean => {
		const tab = this.tabs.getTabById(tabId);
		const targetGroup = this.tabs.getGroupById(groupId);
		if (!tab || !targetGroup) {
			return false;
		}

		return this.tabs.runStateTransaction('add-tab-to-group', () => {
			if (tab.isPinned) {
				this.tabs.pinManager?.unpinTab(tabId);
			}

			this.removeTabFromOwningGroup(tab);
			this.assignTabToGroup(tab, targetGroup, targetIndex);
			this.tabs.syncTabVisualState(tabId);
		});
	};

	removeTabFromGroup = (
		tabId: string,
		toUngroupedIndex?: number
	): boolean => {
		const tab = this.tabs.getTabById(tabId);
		if (!tab || !tab.groupId) {
			return false;
		}

		return this.tabs.runStateTransaction('remove-tab-from-group', () => {
			this.removeTabFromOwningGroup(tab);

			const ungroupedTabs = this.tabs.getUngroupedUnpinnedTabs();
			if (ungroupedTabs.length === 0) {
				this.tabs.syncTabVisualState(tab.id);
				return;
			}

			const boundedIndex =
				typeof toUngroupedIndex === 'number'
					? Math.max(
							0,
							Math.min(toUngroupedIndex, ungroupedTabs.length - 1)
						)
					: ungroupedTabs.length - 1;

			this.tabs.reorderUngrouped(tab.id, boundedIndex);
			this.tabs.syncTabVisualState(tab.id);
		});
	};

	deleteGroup = (groupId: string): boolean => {
		const group = this.tabs.getGroupById(groupId);
		if (!group) {
			return false;
		}

		return this.tabs.runStateTransaction('delete-group', () => {
			const tabIds = [...group.tabIds];
			for (const tabId of tabIds) {
				const tab = this.tabs.getTabById(tabId);
				if (!tab) {
					continue;
				}
				tab.groupId = undefined;
				this.tabs.syncTabVisualState(tabId);
			}

			this.tabs.groups = this.tabs
				.getGroups()
				.filter(g => g.id !== groupId);
		});
	};

	ungroupAllTabs = (groupId: string): boolean => {
		const group = this.tabs.getGroupById(groupId);
		if (!group) {
			return false;
		}

		return this.tabs.runStateTransaction('ungroup-all-tabs', () => {
			const tabsInGroup = [...group.tabIds]
				.map(tabId => this.tabs.getTabById(tabId))
				.filter((tab): tab is TabData => Boolean(tab));

			for (const tab of tabsInGroup) {
				tab.groupId = undefined;
				this.tabs.syncTabVisualState(tab.id);
			}

			this.tabs.groups = this.tabs
				.getGroups()
				.filter(g => g.id !== groupId);

			const startIndex = this.getUngroupedInsertionIndex();
			tabsInGroup.forEach((tab, idx) => {
				this.tabs.reorderUngrouped(tab.id, startIndex + idx);
			});
		});
	};

	toggleGroupCollapse = (groupId: string): boolean => {
		const group = this.tabs.getGroupById(groupId);
		if (!group) {
			return false;
		}

		group.isCollapsed = !group.isCollapsed;
		const groupHeader =
			this.tabs.groupHeaderElementById.get(groupId) || null;
		if (groupHeader) {
			this.tabs.ui.setState(
				groupHeader,
				group.isCollapsed ? 'collapsed' : null
			);
		}
		this.tabs.renderTabStrip();
		return true;
	};

	renameGroup = (groupId: string, nextName?: string): boolean => {
		const group = this.tabs.getGroupById(groupId);
		if (!group) {
			return false;
		}

		const resolvedName = (
			nextName ??
			prompt('Enter new group name:', group.name) ??
			''
		).trim();
		if (!resolvedName || resolvedName === group.name) {
			return false;
		}

		group.name = resolvedName;
		this.tabs.renderTabStrip();
		return true;
	};

	changeGroupColor = (groupId: string, color: string): boolean => {
		const group = this.tabs.getGroupById(groupId);
		if (!group) {
			return false;
		}

		group.color = color;
		group.tabIds.forEach(tabId => this.tabs.syncTabVisualState(tabId));
		this.tabs.renderTabStrip();
		return true;
	};

	closeAllTabsInGroup = async (groupId: string): Promise<void> => {
		const group = this.tabs.getGroupById(groupId);
		if (!group) {
			return;
		}

		const tabIds = [...group.tabIds];
		for (const tabId of tabIds) {
			await this.tabs.closeTabById(tabId);
		}
	};

	/**
	 * Returns all tab groups (snapshot copy). Used by `chrome.tabGroups.query`.
	 */
	listGroups = (): TabGroup[] => {
		return [...this.tabs.getGroups()];
	};

	/**
	 * Look up a group by its DDX string id. Used by `chrome.tabGroups.get`.
	 * Thin pass-through to `tabs.getGroupById` so callers can stay on
	 * `groupManager.*` for the whole tabGroups surface.
	 */
	getGroupById = (groupId: string): TabGroup | undefined => {
		return this.tabs.getGroupById(groupId);
	};

	/**
	 * Apply partial updates to a group. Mirrors `chrome.tabGroups.update`:
	 *   - `title`  → `group.name`
	 *   - `color`  → `group.color`
	 *   - `collapsed` → `group.isCollapsed` (only toggles if it changes
	 *     to keep `toggleGroupCollapse` UI state in sync)
	 * Re-renders the tab strip on any change.
	 */
	updateGroup = (
		groupId: string,
		props: { title?: string; color?: string; collapsed?: boolean }
	): TabGroup | null => {
		const group = this.tabs.getGroupById(groupId);
		if (!group) return null;

		let changed = false;
		if (
			typeof props.title === 'string' &&
			props.title.trim() &&
			props.title !== group.name
		) {
			group.name = props.title;
			changed = true;
		}
		if (typeof props.color === 'string' && props.color !== group.color) {
			group.color = props.color;
			group.tabIds.forEach(tabId => this.tabs.syncTabVisualState(tabId));
			changed = true;
		}
		if (
			typeof props.collapsed === 'boolean' &&
			props.collapsed !== group.isCollapsed
		) {
			this.toggleGroupCollapse(groupId);
			changed = true;
		}

		if (changed) {
			this.tabs.renderTabStrip();
		}
		return group;
	};

	/**
	 * Move a group to a target position within the tab strip. Mirrors
	 * `chrome.tabGroups.move({groupId, index})`. DDX has no separate
	 * "group order" array — groups are positioned by where their
	 * member-tabs sit in the flat tab list. We approximate `index` as
	 * the target slot for the group's FIRST tab among ungrouped/grouped
	 * tabs, then re-anchor sibling tabs to follow.
	 *
	 * Returns the updated group, or null if the group doesn't exist.
	 */
	moveGroup = (groupId: string, targetIndex: number): TabGroup | null => {
		const group = this.tabs.getGroupById(groupId);
		if (!group || group.tabIds.length === 0) return null;

		this.tabs.runStateTransaction('move-group', () => {
			const orderedTabIds = [...group.tabIds];
			// Re-anchor: move the first tab to `targetIndex`, then place
			// the rest immediately after, preserving intra-group order.
			const ungrouped = this.tabs.getUngroupedUnpinnedTabs().map(t => t.id);
			const clamped = Math.max(
				0,
				Math.min(targetIndex, ungrouped.length + orderedTabIds.length)
			);
			orderedTabIds.forEach((tabId, idx) => {
				this.tabs.reorderUngrouped(tabId, clamped + idx);
			});
		});

		this.tabs.renderTabStrip();
		return group;
	};
}
