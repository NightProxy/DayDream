import type { TabsInterface } from './types';

export class TabPinManager2 {
	private tabs: TabsInterface;

	constructor(tabs: TabsInterface) {
		this.tabs = tabs;
	}

	isPinned = (tabId: string): boolean => {
		return this.tabs.isTabPinned(tabId);
	};

	pinTab = (tabId: string): boolean => {
		const tab = this.tabs.getTabById(tabId);
		if (!tab || tab.isPinned) {
			return false;
		}

		return this.tabs.runStateTransaction('pin-tab', () => {
			if (tab.groupId) {
				this.tabs.groupManager?.removeTabFromGroup(tabId);
			}

			tab.groupId = undefined;
			this.tabs.setTabPinned(tabId, true);
			this.tabs.reorderPinned(
				tabId,
				this.tabs.getPinnedTabs().length - 1
			);
			this.tabs.syncTabVisualState(tabId);
		});
	};

	unpinTab = (tabId: string): boolean => {
		const tab = this.tabs.getTabById(tabId);
		if (!tab || !tab.isPinned) {
			return false;
		}

		return this.tabs.runStateTransaction('unpin-tab', () => {
			this.tabs.setTabPinned(tabId, false);
			tab.groupId = undefined;
			this.tabs.syncTabVisualState(tabId);
		});
	};

	togglePin = (tabId: string): boolean => {
		return this.isPinned(tabId) ? this.unpinTab(tabId) : this.pinTab(tabId);
	};

	togglePinTab = (tabId: string): boolean => {
		return this.togglePin(tabId);
	};
}
