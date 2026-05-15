import type { TabSplitPlacement, TabsInterface } from './types';

interface ManagedFrame {
	iframe: HTMLIFrameElement;
	frameId: string;
	proxyHandle: any;
	placement: TabSplitPlacement;
}

export class TabFrameManager {
	private tabs: TabsInterface;
	private managedByTabId: Map<string, ManagedFrame> = new Map();

	constructor(tabs: TabsInterface) {
		this.tabs = tabs;
	}

	createManagedFrame = async (
		tabId: string,
		url: string,
		placement: TabSplitPlacement = 'main'
	): Promise<{
		iframe: HTMLIFrameElement;
		frameId: string;
		proxyHandle: any;
	}> => {
		const tabSuffix = tabId.startsWith('tab-')
			? tabId.replace('tab-', '')
			: tabId;
		const iframe = this.tabs.ui.createElement('iframe', {
			id: `iframe-${tabSuffix}`,
			title: `Iframe for ${tabId}`
		}) as HTMLIFrameElement;

		iframe.setAttribute('data-tab-id', tabId);
		iframe.setAttribute('data-split-placement', placement);

		const proxyHandle = await this.tabs.proxy.createFrame(iframe);
		const processedSrc = await this.tabs.proto.processUrl(url, iframe);
		if (processedSrc) {
			iframe.setAttribute('src', processedSrc);
		}

		const managed: ManagedFrame = {
			iframe,
			frameId: iframe.id,
			proxyHandle,
			placement
		};

		this.managedByTabId.set(tabId, managed);

		return {
			iframe,
			frameId: managed.frameId,
			proxyHandle
		};
	};

	attachFrame = (tabId: string, container: HTMLElement): void => {
		const managed = this.managedByTabId.get(tabId);
		if (!managed) {
			return;
		}

		if (managed.iframe.parentElement !== container) {
			container.appendChild(managed.iframe);
		}
	};

	navigateFrame = async (tabId: string, url: string): Promise<void> => {
		const managed = this.managedByTabId.get(tabId);
		if (!managed) {
			return;
		}

		const processedSrc = await this.tabs.proto.processUrl(
			url,
			managed.iframe
		);
		if (processedSrc) {
			managed.iframe.setAttribute('src', processedSrc);
		}
	};

	cleanupFrame = (tabId: string): void => {
		const managed = this.managedByTabId.get(tabId);
		if (!managed) {
			return;
		}

		try {
			managed.iframe.src = 'about:blank';
			managed.iframe.contentWindow?.stop();
		} catch {
			// best effort cleanup
		}

		const deleted = this.tabs.proxy.deleteFrame(managed.iframe);
		if (!deleted) {
			managed.iframe.remove();
		}

		this.managedByTabId.delete(tabId);
	};

	setFramePlacement = (
		tabId: string,
		splitPlacement: TabSplitPlacement
	): void => {
		const managed = this.managedByTabId.get(tabId);
		if (!managed) {
			return;
		}

		managed.placement = splitPlacement;
		managed.iframe.setAttribute('data-split-placement', splitPlacement);
	};
}
