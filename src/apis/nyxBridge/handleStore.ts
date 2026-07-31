
import type { TabId, ElementHandle } from './api';

interface Entry {
	tabId: TabId;
	ref: WeakRef<Element>;
}

export class HandleStore {
	private map = new Map<string, Entry>();
	private nextId = 1;

	create(tabId: TabId, el: Element): ElementHandle {
		const id = `h-${this.nextId++}`;
		this.map.set(id, { tabId, ref: new WeakRef(el) });
		return { __handle: id, tabId };
	}

	resolve(handle: ElementHandle): Element | null {
		const e = this.map.get(handle.__handle);
		if (!e || e.tabId !== handle.tabId) return null;
		const el = e.ref.deref();
		if (!el || !el.isConnected) {
			this.map.delete(handle.__handle);
			return null;
		}
		return el;
	}

	dropByTab(tabId: TabId): void {
		for (const [k, v] of this.map) if (v.tabId === tabId) this.map.delete(k);
	}
}
