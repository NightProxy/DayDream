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
		placement: TabSplitPlacement = 'main',
		opts?: { plugins?: unknown[] }
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

		// Tabs that need a per-frame Scramjet plugin (e.g. extension
		// newtab overrides — the HeliumExtensionPlugin synthesises
		// responses for `<extId>.ddx`) go through a different path:
		//
		//   - `createFrame(iframe, { plugins })` installs the plugin
		//     into the Frame's request hook (plugins can only be
		//     attached at construction time).
		//   - `frame.go(url)` is used instead of `iframe.setAttribute('src', ...)`.
		//     Setting src directly bypasses Scramjet's URL rewriter
		//     AND the SW path, so the browser does a real DNS lookup
		//     for `<extId>.ddx` → ERR_NAME_NOT_RESOLVED. `frame.go`
		//     runs the URL through Scramjet's encoder, the SW catches
		//     it, the SW invokes the plugin, the plugin sees the
		//     original URL and serves from extfs.
		const hasPlugins = !!(opts?.plugins && opts.plugins.length > 0);
		const proxyHandle = hasPlugins
			? await this.tabs.proxy.createFrame(iframe, { plugins: opts!.plugins! })
			: await this.tabs.proxy.createFrame(iframe);

		if (hasPlugins) {
			// frame.go honours the plugin chain. Don't pre-resolve via
			// processUrl — the plugin expects the original URL.
			try {
				const frame = proxyHandle as { go?: (u: string) => void };
				if (typeof frame.go === 'function') {
					frame.go(url);
				} else {
					iframe.setAttribute('src', url);
				}
			} catch (err) {
				console.warn('[frameManager] frame.go failed, falling back to iframe.src:', err);
				iframe.setAttribute('src', url);
			}
		} else {
			const processedSrc = await this.tabs.proto.processUrl(url, iframe);
			if (processedSrc) {
				iframe.setAttribute('src', processedSrc);
			}
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
		if (!managed) return;
		if (managed.iframe.parentElement !== container) {
			container.appendChild(managed.iframe);
		}
	};

	navigateFrame = async (tabId: string, url: string): Promise<void> => {
		const managed = this.managedByTabId.get(tabId);
		if (!managed) return;
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
		if (!managed) return;

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
		if (!managed) return;
		managed.placement = splitPlacement;
		managed.iframe.setAttribute('data-split-placement', splitPlacement);
	};
}
