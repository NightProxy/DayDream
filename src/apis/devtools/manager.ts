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
				this.dispatchLifecycle('helium:devtools-closed', tabId);
				console.log('[ddx-devtools] hid existing session for', tabId);
			} else {
				existing.show();
				this.dispatchLifecycle('helium:devtools-opened', tabId);
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
		this.dispatchLifecycle('helium:devtools-opened', tabId);
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

	private dispatchLifecycle(
		name: 'helium:devtools-opened' | 'helium:devtools-closed',
		tabId: string,
	): void {
		try {
			document.dispatchEvent(new CustomEvent(name, { detail: { tabId } }));
		} catch (err) {
			console.warn('[ddx-devtools] lifecycle dispatch failed:', name, err);
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
		this.dispatchLifecycle('helium:devtools-closed', tabId);
	}

	/**
	 * Returns the active session for a tab, or undefined if devtools
	 * is not open for that tab. Used by chrome.devtools.* host handlers
	 * to attach extension panels / route inspectedWindow.eval.
	 */
	getSession(tabId: string): DevToolsSession | undefined {
		return this.sessions.get(tabId);
	}

	/** Snapshot of all open sessions (used to spawn devtools_page iframes). */
	listSessions(): DevToolsSession[] {
		return Array.from(this.sessions.values());
	}

	/**
	 * Remove every extension panel registered for `extId` across all
	 * open sessions. Called by ExtensionManager on extension kill.
	 */
	removeExtensionPanelsAll(extId: string): void {
		for (const s of this.sessions.values()) {
			try {
				s.removeExtensionPanels(extId);
			} catch (err) {
				console.warn(
					'[ddx-devtools] removeExtensionPanels failed for',
					extId,
					err,
				);
			}
		}
	}
}
