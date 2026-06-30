/**
 * Singleton coordinator for "Inspect views" on the ddx://extensions
 * page. Parallels the per-tab DevToolsManager but for extension
 * targets — backgrounds, popups, options, devtools_pages, and
 * content-script Neutron workers.
 *
 * Owns:
 *   - the ExtensionTargetRegistry (one per app)
 *   - active sessions, keyed by `${extId}::${targetId}`
 *   - the worker-agent source cache (fetched once, reused)
 *
 * Public surface (used by the extensions page and by the spawners):
 *   - `targetRegistry` — spawners call register/unregister on this
 *   - `openTarget(extId, targetId, mount)` — UI calls this
 *   - `closeTarget(extId, targetId)` — UI calls this
 *   - `isOpen(extId, targetId)` — UI uses for button state
 *   - `listFor(extId)` — UI renders this
 *   - `subscribe(listener)` — UI re-renders on changes
 */

import {
	ExtensionIframeDevToolsSession,
	ExtensionWorkerDevToolsSession,
	type ExtensionDevToolsSession,
} from './extensionSession';
import {
	ExtensionTargetRegistry,
	type ExtensionTarget,
	type TargetEvent,
} from './extensionTargetRegistry';

interface ManagerOpts {
	devtoolsHostUrl: string;
	/** Path the host can fetch the worker-agent IIFE bundle from. */
	workerAgentUrl: string;
}

export class ExtensionDevToolsManager {
	readonly targetRegistry = new ExtensionTargetRegistry();
	private readonly sessions = new Map<string, ExtensionDevToolsSession>();
	private readonly opts: ManagerOpts;
	private workerAgentSourcePromise: Promise<string> | null = null;
	private readonly listeners = new Set<(e: TargetEvent) => void>();

	constructor(opts: ManagerOpts) {
		this.opts = opts;

		this.targetRegistry.subscribe((e) => {
			if (e.kind === 'removed') {
				const key = `${e.extId}::${e.targetId}`;
				const session = this.sessions.get(key);
				if (session) {
					try {
						session.close();
					} catch (err) {
						console.warn('[ddx-ext-devtools] session.close on target removal threw:', err);
					}
				}
			}
			for (const l of this.listeners) {
				try {
					l(e);
				} catch (err) {
					console.warn('[ddx-ext-devtools] listener threw:', err);
				}
			}
		});
	}

	subscribe(listener: (e: TargetEvent) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	listFor(extId: string): ExtensionTarget[] {
		return this.targetRegistry.listFor(extId);
	}

	isOpen(extId: string, targetId: string): boolean {
		return this.sessions.has(`${extId}::${targetId}`);
	}

	async openTarget(extId: string, targetId: string): Promise<void> {
		const key = `${extId}::${targetId}`;
		console.log('[ddx-ext-devtools] openTarget:', key);
		const existing = this.sessions.get(key);
		if (existing) {
			console.log('[ddx-ext-devtools] openTarget: session already open');
			return;
		}

		const target = this.targetRegistry.get(extId, targetId);
		if (!target) {
			console.warn(
				`[ddx-ext-devtools] openTarget: no registered target for ${key}`,
			);
			return;
		}

		const onClose = () => {
			console.log('[ddx-ext-devtools] onClose fired for', key);
			this.sessions.delete(key);
			if (target.kind !== 'content-script') {
				this.targetRegistry.markIframeWanted(target.iframe, false);
			}
			for (const l of this.listeners) {
				try {
					l({ kind: 'removed', extId, targetId });
				} catch (err) {
					console.warn('[ddx-ext-devtools] listener threw on close:', err);
				}
			}
		};

		if (target.kind === 'content-script') {
			let src: string;
			try {
				src = await this.loadWorkerAgentSource();
				console.log(
					'[ddx-ext-devtools] loaded worker-agent source,',
					src.length,
					'bytes',
				);
			} catch (err) {
				console.warn(
					'[ddx-ext-devtools] worker agent source fetch failed:',
					err,
				);
				return;
			}
			const session = new ExtensionWorkerDevToolsSession({
				devtoolsHostUrl: this.opts.devtoolsHostUrl,
				target,
				workerAgentSource: src,
				onClose,
			});
			this.sessions.set(key, session);
			return;
		}

		this.targetRegistry.markIframeWanted(target.iframe, true);
		const session = new ExtensionIframeDevToolsSession({
			devtoolsHostUrl: this.opts.devtoolsHostUrl,
			target,
			onClose,
		});
		this.sessions.set(key, session);

		try {
			const src = target.iframe.getAttribute('src');
			if (src) {
				console.log('[ddx-ext-devtools] re-navigating BG iframe to trigger agent injection');
				target.iframe.setAttribute('src', src);
			} else {
				console.warn('[ddx-ext-devtools] BG iframe has no src attribute');
			}
		} catch (err) {
			console.warn('[ddx-ext-devtools] iframe re-navigation failed:', err);
		}
	}

	closeTarget(extId: string, targetId: string): void {
		const key = `${extId}::${targetId}`;
		const session = this.sessions.get(key);
		if (!session) return;
		try {
			session.close();
		} catch (err) {
			console.warn('[ddx-ext-devtools] closeTarget threw:', err);
		}
	}

	private loadWorkerAgentSource(): Promise<string> {
		if (this.workerAgentSourcePromise) return this.workerAgentSourcePromise;
		this.workerAgentSourcePromise = fetch(this.opts.workerAgentUrl, {
			credentials: 'omit',
		})
			.then((r) => {
				if (!r.ok) throw new Error(`worker-agent fetch ${r.status}`);
				return r.text();
			})
			.catch((err) => {
				this.workerAgentSourcePromise = null;
				throw err;
			});
		return this.workerAgentSourcePromise;
	}
}
