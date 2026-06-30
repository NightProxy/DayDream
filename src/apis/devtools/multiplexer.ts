/**
 * CDP multiplexer: makes one chii devtools-frontend instance speak to N
 * per-frame chobitsu instances by synthesizing the CDP `Target` domain
 * on the host side.
 *
 * No DOM. No Scramjet. No chobitsu. Pure state machine wired with two
 * callbacks: postToDevTools (sends a CDP JSON string to the front_end)
 * and per-frame postToFrame (sends a CDP JSON string to one agent).
 */

import type { FrameRecord, TargetInfo } from './types';

interface MuxOpts {
	postToDevTools: (cdpJson: string) => void;
}

export class CdpMultiplexer {
	private postToDevTools: (cdpJson: string) => void;
	private frames = new Map<string, FrameRecord>();
	private sessions = new Map<string, string>();
	private attachments = new Map<string, string>();
	private discoverEnabled = false;
	private autoAttachEnabled = false;
	private topLevelFrameId: string | null = null;
	private pendingRequests = new Map<string, Map<number, string | null>>();
	private hostRequests = new Map<
		number,
		{ resolve: (result: unknown) => void; reject: (err: Error) => void }
	>();
	private nextHostRequestId = -1_000_000;

	constructor(opts: MuxOpts) {
		this.postToDevTools = opts.postToDevTools;
	}

	attachFrame(record: FrameRecord): void {
		this.frames.set(record.frameId, record);
		if (record.parentFrameId === null && this.topLevelFrameId === null) {
			this.topLevelFrameId = record.frameId;
		}
		if (this.discoverEnabled) {
			this.emitEvent('Target.targetCreated', {
				targetInfo: this.toTargetInfo(record),
			});
		}
		if (
			this.autoAttachEnabled &&
			record.parentFrameId !== null &&
			!this.attachments.has(record.frameId)
		) {
			this.attachInternal(record.frameId);
		}
	}

	detachFrame(frameId: string): void {
		const rec = this.frames.get(frameId);
		if (!rec) return;
		this.pendingRequests.delete(frameId);
		const sid = this.attachments.get(frameId);
		if (sid) {
			this.sessions.delete(sid);
			this.attachments.delete(frameId);
			this.emitEvent('Target.detachedFromTarget', {
				sessionId: sid,
				targetId: frameId,
			});
		}
		this.emitEvent('Target.targetDestroyed', { targetId: frameId });
		this.frames.delete(frameId);
		const wasTopLevel = this.topLevelFrameId === frameId;
		if (wasTopLevel) {
			this.topLevelFrameId =
				[...this.frames.values()].find((f) => f.parentFrameId === null)
					?.frameId ?? null;
			if (this.hostRequests.size > 0) {
				const err = new Error('CdpMultiplexer.request: top-level frame detached before response');
				for (const [, p] of this.hostRequests) p.reject(err);
				this.hostRequests.clear();
			}
		}
	}

	updateFrameMetadata(
		frameId: string,
		patch: { url?: string; title?: string }
	): void {
		const rec = this.frames.get(frameId);
		if (!rec) return;
		if (patch.url !== undefined) rec.url = patch.url;
		if (patch.title !== undefined) rec.title = patch.title;
		if (this.discoverEnabled) {
			this.emitEvent('Target.targetInfoChanged', {
				targetInfo: this.toTargetInfo(rec),
			});
		}
	}

	receiveFromDevTools(cdpJson: string): void {
		let msg: any;
		try {
			msg = JSON.parse(cdpJson);
		} catch {
			return;
		}
		const { id, method, params, sessionId } = msg ?? {};

		if (typeof method === 'string' && method.startsWith('Target.')) {
			this.handleTargetMethod(
				id,
				method,
				params ?? {},
				typeof sessionId === 'string' ? sessionId : null
			);
			return;
		}

		if (typeof sessionId === 'string') {
			const frameId = this.sessions.get(sessionId);
			if (!frameId) return;
			const rec = this.frames.get(frameId);
			if (!rec) return;
			const forwarded = { ...msg };
			delete forwarded.sessionId;
			if (typeof id === 'number') {
				this.recordPending(frameId, id, sessionId);
			}
			rec.postToFrame(JSON.stringify(forwarded));
			return;
		}

		if (this.topLevelFrameId) {
			const rec = this.frames.get(this.topLevelFrameId);
			if (typeof id === 'number') {
				this.recordPending(this.topLevelFrameId, id, null);
			}
			rec?.postToFrame(cdpJson);
		}
	}

	receiveFromFrame(frameId: string, cdpJson: string): void {
		let msg: any;
		try {
			msg = JSON.parse(cdpJson);
		} catch {
			return;
		}

		if (typeof msg?.id === 'number') {
			const hostPending = this.hostRequests.get(msg.id);
			if (hostPending) {
				this.hostRequests.delete(msg.id);
				if (msg.error) {
					hostPending.reject(
						new Error(msg.error?.message ?? 'CDP error'),
					);
				} else {
					hostPending.resolve(msg.result);
				}
				return;
			}
			const origin = this.takePending(frameId, msg.id);
			if (origin) {
				this.postToDevTools(JSON.stringify({ ...msg, sessionId: origin }));
			} else {
				this.postToDevTools(cdpJson);
			}
			return;
		}

		const sid = this.attachments.get(frameId);
		if (sid) {
			this.postToDevTools(JSON.stringify({ ...msg, sessionId: sid }));
		} else {
			this.postToDevTools(cdpJson);
		}
	}

	/**
	 * Issue a CDP method against the top-level frame and resolve with
	 * the response result (or reject on error / timeout). Used by host
	 * code (e.g. chrome.devtools.inspectedWindow.eval) that needs to
	 * speak CDP without going through the devtools front-end pipeline.
	 *
	 * Request ids are drawn from a private negative range to avoid
	 * collisions with DT-originated ids. The response short-circuits
	 * `receiveFromFrame` and never reaches `postToDevTools`.
	 *
	 * Throws synchronously if no top-level frame is attached.
	 */
	request<T = unknown>(
		method: string,
		params: Record<string, unknown> = {},
		opts: { timeoutMs?: number } = {},
	): Promise<T> {
		const frameId = this.topLevelFrameId;
		if (!frameId) {
			return Promise.reject(new Error('CdpMultiplexer.request: no top-level frame attached'));
		}
		const rec = this.frames.get(frameId);
		if (!rec) {
			return Promise.reject(new Error('CdpMultiplexer.request: top-level frame record missing'));
		}
		const id = this.nextHostRequestId--;
		const timeoutMs = opts.timeoutMs ?? 5000;
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				if (!this.hostRequests.has(id)) return;
				this.hostRequests.delete(id);
				reject(new Error(`CdpMultiplexer.request: ${method} timed out after ${timeoutMs}ms`));
			}, timeoutMs);
			this.hostRequests.set(id, {
				resolve: (result) => {
					clearTimeout(timer);
					resolve(result as T);
				},
				reject: (err) => {
					clearTimeout(timer);
					reject(err);
				},
			});
			try {
				rec.postToFrame(JSON.stringify({ id, method, params }));
			} catch (err) {
				clearTimeout(timer);
				this.hostRequests.delete(id);
				reject(err instanceof Error ? err : new Error(String(err)));
			}
		});
	}

	private recordPending(
		frameId: string,
		id: number,
		sessionId: string | null
	): void {
		let map = this.pendingRequests.get(frameId);
		if (!map) {
			map = new Map();
			this.pendingRequests.set(frameId, map);
		}
		map.set(id, sessionId);
	}

	private takePending(frameId: string, id: number): string | null | undefined {
		const map = this.pendingRequests.get(frameId);
		if (!map) return undefined;
		if (!map.has(id)) return undefined;
		const value = map.get(id) ?? null;
		map.delete(id);
		return value;
	}

	private handleTargetMethod(
		id: number | undefined,
		method: string,
		params: Record<string, unknown>,
		originSessionId: string | null
	): void {
		const reply = (result: unknown, errorMessage?: string) =>
			this.respond(id, result, originSessionId, errorMessage);
		switch (method) {
			case 'Target.setDiscoverTargets': {
				this.discoverEnabled = !!(params as { discover?: boolean })
					.discover;
				reply({});
				if (this.discoverEnabled) {
					for (const rec of this.frames.values()) {
						this.emitEvent('Target.targetCreated', {
							targetInfo: this.toTargetInfo(rec),
						});
					}
				}
				return;
			}
			case 'Target.setAutoAttach': {
				this.autoAttachEnabled = !!(params as { autoAttach?: boolean })
					.autoAttach;
				reply({});
				if (this.autoAttachEnabled) {
					for (const rec of this.frames.values()) {
						if (rec.parentFrameId === null) continue;
						if (!this.attachments.has(rec.frameId)) {
							this.attachInternal(rec.frameId);
						}
					}
				}
				return;
			}
			case 'Target.getTargets': {
				const targetInfos: TargetInfo[] = [...this.frames.values()].map(
					(r) => this.toTargetInfo(r)
				);
				reply({ targetInfos });
				return;
			}
			case 'Target.attachToTarget': {
				const targetId = (params as { targetId?: string }).targetId;
				if (!targetId || !this.frames.has(targetId)) {
					reply({}, 'Target not found');
					return;
				}
				const existing = this.attachments.get(targetId);
				if (existing) {
					reply({ sessionId: existing });
					return;
				}
				const fresh = crypto.randomUUID();
				this.sessions.set(fresh, targetId);
				this.attachments.set(targetId, fresh);
				reply({ sessionId: fresh });
				const rec = this.frames.get(targetId)!;
				this.emitEvent('Target.attachedToTarget', {
					sessionId: fresh,
					targetInfo: this.toTargetInfo(rec),
					waitingForDebugger: false,
				});
				return;
			}
			case 'Target.detachFromTarget': {
				const sid = (params as { sessionId?: string }).sessionId;
				if (sid) this.detachSession(sid);
				reply({});
				return;
			}
			case 'Target.sendMessageToTarget': {
				const p = params as { sessionId?: string; message?: string };
				if (typeof p.message === 'string') {
					try {
						const inner = JSON.parse(p.message);
						if (p.sessionId && typeof inner === 'object' && inner !== null) {
							inner.sessionId = p.sessionId;
						}
						this.receiveFromDevTools(JSON.stringify(inner));
					} catch {
						// ignore
					}
				}
				reply({});
				return;
			}
			case 'Target.closeTarget': {
				reply({ success: false });
				return;
			}
			default: {
				reply({});
				return;
			}
		}
	}

	private attachInternal(frameId: string): string {
		const sid = this.attachments.get(frameId);
		if (sid) return sid;
		const fresh = crypto.randomUUID();
		this.sessions.set(fresh, frameId);
		this.attachments.set(frameId, fresh);
		const rec = this.frames.get(frameId)!;
		this.emitEvent('Target.attachedToTarget', {
			sessionId: fresh,
			targetInfo: this.toTargetInfo(rec),
			waitingForDebugger: false,
		});
		return fresh;
	}

	private detachSession(sessionId: string): void {
		const frameId = this.sessions.get(sessionId);
		if (!frameId) return;
		this.sessions.delete(sessionId);
		this.attachments.delete(frameId);
		this.emitEvent('Target.detachedFromTarget', {
			sessionId,
			targetId: frameId,
		});
	}

	private toTargetInfo(rec: FrameRecord): TargetInfo {
		return {
			targetId: rec.frameId,
			type: rec.parentFrameId === null ? 'page' : 'iframe',
			title: rec.title,
			url: rec.url,
			attached: this.attachments.has(rec.frameId),
			canAccessOpener: false,
		};
	}

	private respond(
		id: number | undefined,
		result: unknown,
		sessionId: string | null,
		errorMessage?: string
	): void {
		if (typeof id !== 'number') return;
		const base =
			errorMessage !== undefined
				? { id, error: { code: -32000, message: errorMessage } }
				: { id, result };
		const out = sessionId ? { ...base, sessionId } : base;
		this.postToDevTools(JSON.stringify(out));
	}

	private emitEvent(method: string, params: unknown): void {
		this.postToDevTools(JSON.stringify({ method, params }));
	}
}
