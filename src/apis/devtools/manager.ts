/**
 * Top-level devtools coordinator. One instance, on window.devtools.
 */

import { DevToolsSession } from './session';
import type { PanelHandle } from './panel';

interface TabLike {
	id: string;
	iframe: HTMLIFrameElement;
	devtoolsPanel?: PanelHandle | undefined;
}

interface ManagerOpts {
	devtoolsHostUrl: string;
	getTabData: (tabId: string) => TabLike | undefined;
}

export class DevToolsManager {
	private sessions = new Map<string, DevToolsSession>();
	private opts: ManagerOpts;

	constructor(opts: ManagerOpts) {
		this.opts = opts;
		console.log(
			'[ddx-devtools] manager constructed; hostUrl=',
			opts.devtoolsHostUrl
		);
	}

	toggle(tabId: string): void {
		console.log('[ddx-devtools] manager.toggle', tabId);
		const existing = this.sessions.get(tabId);
		if (existing) {
			const tab = this.opts.getTabData(tabId);
			const visible = tab?.devtoolsPanel?.isActive === true;
			if (visible) {
				existing.hide();
				console.log('[ddx-devtools] hid existing session for', tabId);
			} else {
				existing.show();
				console.log('[ddx-devtools] showed existing session for', tabId);
			}
			return;
		}
		const tab = this.opts.getTabData(tabId);
		if (!tab) {
			console.warn('[ddx-devtools] toggle: no tab data for', tabId);
			return;
		}
		const session = new DevToolsSession({
			tabId,
			tabData: tab,
			devtoolsHostUrl: this.opts.devtoolsHostUrl,
			onClose: () => {
				this.sessions.delete(tabId);
			},
		});
		this.sessions.set(tabId, session);
		console.log(
			'[ddx-devtools] session created for',
			tabId,
			'; reloading proxied iframe so agent injects'
		);
		try {
			tab.iframe.contentWindow?.location.reload();
		} catch (err) {
			console.warn('[ddx-devtools] iframe reload failed:', err);
		}
	}

	isEnabledForTab(tabId: string): boolean {
		return this.sessions.has(tabId);
	}

	registerProxiedWindow(tabId: string, win: Window): void {
		this.sessions.get(tabId)?.attachProxiedWindow(win);
	}

	unregisterProxiedWindow(tabId: string, win: Window): void {
		this.sessions.get(tabId)?.detachProxiedWindow(win);
	}

	onTabSelect(tabId: string): void {
		for (const [id, session] of this.sessions) {
			if (id === tabId) session.show();
			else session.hide();
		}
	}

	onTabClose(tabId: string): void {
		const session = this.sessions.get(tabId);
		if (!session) return;
		session.destroy();
		this.sessions.delete(tabId);
	}
}
