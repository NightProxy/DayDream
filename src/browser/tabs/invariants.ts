import type {
	TabData,
	TabsInterface,
	VisualOrderMode,
	VisualTabOrderEntry
} from './types';

const isDevBuild = (): boolean => {
	try {
		return Boolean((import.meta as any)?.env?.DEV);
	} catch {
		return false;
	}
};

export const getPinnedTabs = (tabs: TabData[]): TabData[] => {
	return tabs.filter(tab => tab.isPinned);
};

export const getUngroupedUnpinnedTabs = (tabs: TabData[]): TabData[] => {
	return tabs.filter(tab => !tab.isPinned && !tab.groupId);
};

export const getGroupTabs = (
	tabsHost: TabsInterface,
	groupId: string
): TabData[] => {
	const group = tabsHost.getGroupById(groupId);
	if (!group) {
		return [];
	}

	return group.tabIds
		.map(tabId => tabsHost.getTabById(tabId))
		.filter((tab): tab is TabData => Boolean(tab));
};

export const getVisualTabOrder = (
	tabsHost: TabsInterface,
	_mode: VisualOrderMode
): VisualTabOrderEntry[] => {
	const visual: VisualTabOrderEntry[] = [];

	for (const tab of tabsHost.getPinnedTabs()) {
		visual.push({ kind: 'tab', id: `tab:${tab.id}`, tabId: tab.id });
	}

	for (const group of tabsHost.getGroups()) {
		visual.push({
			kind: 'groupHeader',
			id: `group:${group.id}`,
			groupId: group.id
		});
		if (group.isCollapsed) {
			continue;
		}

		for (const tabId of group.tabIds) {
			const tab = tabsHost.getTabById(tabId);
			if (!tab) {
				continue;
			}
			visual.push({
				kind: 'tab',
				id: `tab:${tab.id}`,
				tabId: tab.id,
				groupId: group.id
			});
		}
	}

	for (const tab of tabsHost.getUngroupedUnpinnedTabs()) {
		visual.push({ kind: 'tab', id: `tab:${tab.id}`, tabId: tab.id });
	}

	return visual;
};

export const runInvariantChecks = (tabsHost: TabsInterface): boolean => {
	const allTabs = tabsHost.getTabsInOrder();
	const tabById = new Map(allTabs.map(tab => [tab.id, tab]));

	for (const group of tabsHost.getGroups()) {
		for (const tabId of group.tabIds) {
			if (!tabById.has(tabId)) {
				console.warn(
					'[Tabs2 invariants] Missing tab for group.tabIds entry',
					{
						groupId: group.id,
						tabId
					}
				);
				return false;
			}
		}
	}

	const reverseMembership = new Map<string, string>();
	for (const group of tabsHost.getGroups()) {
		for (const tabId of group.tabIds) {
			const existingOwner = reverseMembership.get(tabId);
			if (existingOwner && existingOwner !== group.id) {
				console.warn(
					'[Tabs2 invariants] Duplicate group membership detected',
					{
						tabId,
						groupA: existingOwner,
						groupB: group.id
					}
				);
				return false;
			}
			reverseMembership.set(tabId, group.id);
		}
	}

	for (const tab of allTabs) {
		if (tab.isPinned && tab.groupId) {
			console.warn('[Tabs2 invariants] Pinned tab cannot be grouped', {
				tabId: tab.id,
				groupId: tab.groupId
			});
			return false;
		}

		if (tab.groupId) {
			if (reverseMembership.get(tab.id) !== tab.groupId) {
				console.warn(
					'[Tabs2 invariants] tab.groupId mismatch with group.tabIds',
					{
						tabId: tab.id,
						tabGroupId: tab.groupId,
						ownerGroupId: reverseMembership.get(tab.id)
					}
				);
				return false;
			}
		} else if (reverseMembership.has(tab.id)) {
			console.warn(
				'[Tabs2 invariants] Tab appears in group but tab.groupId is empty',
				{
					tabId: tab.id,
					ownerGroupId: reverseMembership.get(tab.id)
				}
			);
			return false;
		}
	}

	const visualIds = getVisualTabOrder(tabsHost, 'horizontal').map(
		entry => entry.id
	);
	const duplicateVisualIds = visualIds.filter(
		(id, idx) => visualIds.indexOf(id) !== idx
	);
	if (duplicateVisualIds.length > 0) {
		console.warn(
			'[Tabs2 invariants] Duplicate draggable ids in visual order',
			{
				duplicates: Array.from(new Set(duplicateVisualIds))
			}
		);
		return false;
	}

	return true;
};

export const shouldRunInvariantChecks = (): boolean => {
	return isDevBuild();
};
