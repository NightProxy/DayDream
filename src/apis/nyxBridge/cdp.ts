// src/apis/nyxBridge/cdp.ts
//
// Host-side CDP request/response correlator. Each tab maps to one
// per-frame agent (`{frameId, win}`). `send(tabId, method, params)`
// JSON-stringifies a CDP envelope, hands it to the agent via the agent's
// installed `__nyxBridgeReceive(frameId, payload)` function, and resolves
// when a `cdp-out` envelope with the matching `id` arrives.
//
// Agent messages (`frame-ready`, `cdp-out`, `frame-gone`, `agent-error`)
// flow in via `handleAgentMessage`, which the hookInstaller wires up.

import { DDXError } from './types';
import type { AgentMessage } from './frameTransport';
import type { TabId } from './api';

interface FrameInfo {
	frameId: string;
	win: Window;
}

interface Pending {
	resolve: (v: any) => void;
	reject: (e: any) => void;
	timer: ReturnType<typeof setTimeout>;
}

export interface CdpHelperOpts {
	timeoutMs?: number;
}

/**
 * Callback fired for every unpaired CDP **event** (notifications
 * without an `id` field, like `Network.requestWillBeSent`).
 * Receives `(tabId, method, params)`. Used by chrome.debugger's
 * onEvent fan-out — chii/chobitsu DevTools doesn't need this
 * because its frontend handles events directly.
 */
export type CdpEventObserver = (
	tabId: TabId,
	method: string,
	params: unknown,
) => void;

export class CdpHelper {
	private byTab = new Map<TabId, FrameInfo>();
	private nextId = 1;
	private pending = new Map<number, Pending>();
	private timeoutMs: number;
	private eventObservers = new Set<CdpEventObserver>();

	constructor(opts: CdpHelperOpts = {}) {
		this.timeoutMs = opts.timeoutMs ?? 10_000;
	}

	registerFrame(tabId: TabId, frameId: string, win: Window): void {
		this.byTab.set(tabId, { frameId, win });
	}

	/**
	 * Register an observer for unpaired CDP events. Returns an
	 * unregister function. Multiple observers may coexist (e.g.
	 * chrome.debugger + future telemetry consumers).
	 */
	onCdpEvent(observer: CdpEventObserver): () => void {
		this.eventObservers.add(observer);
		return () => this.eventObservers.delete(observer);
	}

	private dispatchEvent(frameId: string, method: string, params: unknown): void {
		// Resolve frameId → tabId via byTab reverse lookup.
		let matchedTab: TabId | null = null;
		for (const [tabId, info] of this.byTab) {
			if (info.frameId === frameId) {
				matchedTab = tabId;
				break;
			}
		}
		if (matchedTab === null) return;
		for (const obs of this.eventObservers) {
			try { obs(matchedTab, method, params); } catch (err) {
				console.warn('[CdpHelper] event observer threw:', err);
			}
		}
	}

	handleAgentMessage(frameId: string, msg: AgentMessage, _win: Window): void {
		void _win;
		if (msg.kind === 'frame-ready') return; // Caller (NyxBridge) maps frameId → tabId.
		if (msg.kind === 'frame-gone') {
			for (const [tabId, info] of this.byTab) {
				if (info.frameId === frameId) this.byTab.delete(tabId);
			}
			return;
		}
		if (msg.kind === 'cdp-out' && msg.payload) {
			let parsed: any;
			try { parsed = JSON.parse(msg.payload); } catch { return; }
			// CDP responses have `id`; events have `method` without `id`.
			if (typeof parsed.id === 'number') {
				const p = this.pending.get(parsed.id);
				if (!p) return;
				clearTimeout(p.timer);
				this.pending.delete(parsed.id);
				if (parsed.error) {
					p.reject(new DDXError('cdp_error', parsed.error.message ?? 'cdp error'));
				} else {
					p.resolve(parsed.result);
				}
				return;
			}
			if (typeof parsed.method === 'string') {
				this.dispatchEvent(frameId, parsed.method, parsed.params);
			}
		}
		// kind === 'agent-error' — we currently swallow it. Consider surfacing.
	}

	send(tabId: TabId, method: string, params: object = {}): Promise<any> {
		const info = this.byTab.get(tabId);
		if (!info) return Promise.reject(new DDXError('frame_not_found', `no agent for tab ${tabId}`));
		const id = this.nextId++;
		const payload = JSON.stringify({ id, method, params });
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new DDXError('timeout', `CDP ${method} timed out after ${this.timeoutMs}ms`));
			}, this.timeoutMs);
			this.pending.set(id, { resolve, reject, timer });
			try {
				(info.win as any).__nyxBridgeReceive(info.frameId, payload);
			} catch (e: any) {
				clearTimeout(timer);
				this.pending.delete(id);
				reject(new DDXError('cdp_error', e?.message ?? String(e)));
			}
		});
	}
}
