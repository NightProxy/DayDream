/**
 * Per-extension inspectable-target registry.
 *
 * Populated by the spawners (ExtensionManager for background, popupHost
 * for popups, DevtoolsPageHost for devtools_page iframes, runNeutron for
 * content-script workers). Consumed by ExtensionDevToolsManager, which
 * decides what shows up in the ddx://extensions "Inspect views" list and
 * how to open a session against each kind.
 *
 * Single source of truth — no consumer should keep its own per-extension
 * iframe/worker map. Emits a `change` event after every mutation so the
 * UI can re-render without polling.
 *
 * Cross-references:
 *   - hookInstaller.ts checks `isFrameTargetWanted()` (set when an
 *     iframe-type target is registered) before injecting the per-frame
 *     devtools-agent into ext/popup/devtools_page iframes.
 *   - ExtensionDevToolsManager looks up targets by (extId, targetId) to
 *     open sessions.
 */

export type ExtensionTargetKind =
	| 'background'
	| 'popup'
	| 'options'
	| 'devtools-page'
	| 'content-script';

interface IframeTargetBase {
	extId: string;
	/** Unique within an extId. For singletons this is the kind; for per-tab targets it includes the tabId. */
	targetId: string;
	kind: 'background' | 'popup' | 'options' | 'devtools-page';
	iframe: HTMLIFrameElement;
	/** Human-readable label for the UI. */
	label: string;
	/** Optional ddx tabId for devtools-page targets. */
	tabId?: string;
}

export interface WorkerTarget {
	extId: string;
	targetId: string;
	kind: 'content-script';
	worker: Worker;
	/** DDX tab id this content script is running in. */
	tabId: string;
	/** Per-(extId, tabId, file) key as built by injector.ts. */
	scriptKey: string;
	/** Top-of-page URL when the script attached. */
	url: string;
	/** Script filename for display. */
	label: string;
}

export type ExtensionTarget = IframeTargetBase | WorkerTarget;

export type TargetEvent =
	| { kind: 'added'; target: ExtensionTarget }
	| { kind: 'removed'; extId: string; targetId: string };

type Listener = (e: TargetEvent) => void;

export class ExtensionTargetRegistry {
	private targets = new Map<string, ExtensionTarget>();
	private byExtension = new Map<string, Set<string>>();
	private wantedIframes = new WeakSet<HTMLIFrameElement>();
	private listeners = new Set<Listener>();

	register(target: ExtensionTarget): void {
		const key = `${target.extId}::${target.targetId}`;
		const prev = this.targets.get(key);
		if (prev) {
			if (
				prev.kind !== 'content-script' &&
				target.kind !== 'content-script' &&
				prev.iframe !== target.iframe
			) {
				this.wantedIframes.delete(prev.iframe);
			}
			this.emit({ kind: 'removed', extId: prev.extId, targetId: prev.targetId });
		}
		this.targets.set(key, target);
		let set = this.byExtension.get(target.extId);
		if (!set) {
			set = new Set();
			this.byExtension.set(target.extId, set);
		}
		set.add(target.targetId);
		this.emit({ kind: 'added', target });
	}

	unregister(extId: string, targetId: string): void {
		const key = `${extId}::${targetId}`;
		const prev = this.targets.get(key);
		if (!prev) return;
		this.targets.delete(key);
		const set = this.byExtension.get(extId);
		if (set) {
			set.delete(targetId);
			if (set.size === 0) this.byExtension.delete(extId);
		}
		if (prev.kind !== 'content-script') {
			this.wantedIframes.delete(prev.iframe);
		}
		this.emit({ kind: 'removed', extId, targetId });
	}

	unregisterAllForExtension(extId: string): void {
		const set = this.byExtension.get(extId);
		if (!set) return;
		for (const targetId of Array.from(set)) {
			this.unregister(extId, targetId);
		}
	}

	get(extId: string, targetId: string): ExtensionTarget | undefined {
		return this.targets.get(`${extId}::${targetId}`);
	}

	listFor(extId: string): ExtensionTarget[] {
		const set = this.byExtension.get(extId);
		if (!set) return [];
		const out: ExtensionTarget[] = [];
		for (const targetId of set) {
			const t = this.targets.get(`${extId}::${targetId}`);
			if (t) out.push(t);
		}
		return out;
	}

	listAll(): ExtensionTarget[] {
		return Array.from(this.targets.values());
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * Mark an iframe target as "the user wants devtools on it." Read by
	 * the per-frame hook installer to decide whether to inject the
	 * agent into ext/popup/devtools_page iframes. Defaults to false —
	 * we don't inject agents into every extension iframe just because
	 * it exists, only when the user opens an inspector against it.
	 */
	markIframeWanted(iframe: HTMLIFrameElement, wanted: boolean): void {
		if (wanted) this.wantedIframes.add(iframe);
		else this.wantedIframes.delete(iframe);
	}

	isIframeWanted(iframe: HTMLIFrameElement): boolean {
		return this.wantedIframes.has(iframe);
	}

	private emit(e: TargetEvent): void {
		for (const l of this.listeners) {
			try {
				l(e);
			} catch (err) {
				// eslint-disable-next-line no-console
				console.warn('[ddx-devtools] target-registry listener threw:', err);
			}
		}
	}
}
