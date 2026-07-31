/**
 * Captcha host-side bridge.
 *
 * Listens for `__ddx_captcha_req` messages posted by proxied pages
 * (`hook.runtime.js` is the producer), gates each request on
 * `checkNightPlusStatus()`, calls the backend solver, and posts the
 * result back via the same channel.
 *
 * Built on `RequestResponseChannel` (`src/apis/eventsBridge.ts`) so
 * requestId correlation, source-spoofing protection, and the wire
 * envelope are all handled in one place.
 *
 * One bridge instance per host page (i.e. one in DDX, period). The
 * bridge tracks per-session counters that `window.captcha.stats()`
 * surfaces for diagnostics.
 */

import { checkNightPlusStatus } from '@apis/nightplus';
import {
	RequestResponseChannel,
	type ReplyTransport,
	type RequestHandler
} from '@apis/eventsBridge';
import { HOOK_READY_MARKER, REQ_MARKER, RES_MARKER } from './markers';
import { solveCaptcha, type SolveRequest } from './backend';

/** Captcha types we know about. Keeps the type-narrowing tight. */
const KNOWN_TYPES = new Set([
	'turnstile',
	'hcaptcha',
	'recaptcha-v2',
	'recaptcha-v3',
	'recaptcha-enterprise'
]);

export interface CaptchaStats {
	byType: Record<
		string,
		{ requested: number; solved: number; failed: number }
	>;
	unauthorizedCount: number;
	hookReadyCount: number;
}

export interface PendingSolve {
	requestId: string;
	type: string;
	sitekey: string;
	startedAt: number;
}

/** Test seam: override the backend solver. Default = real `solveCaptcha`. */
export interface CaptchaBridgeDeps {
	checkNightPlusStatus?: () => Promise<boolean>;
	solveCaptcha?: (req: SolveRequest) => Promise<string>;
	/**
	 * The scramjet controller. When provided, the bridge routes replies
	 * through scramjet's per-frame postMessage envelope path so the
	 * proxy's wrapped `Window.postMessage` doesn't crash on pages with
	 * unusual postMessage trap shapes (e.g. dash.cloudflare.com under
	 * scramjet rewrites). The bridge also falls back to the raw
	 * `event.source.postMessage` path for non-proxied iframes (internal
	 * `ddx://` pages, or test fakes).
	 */
	controller?: unknown;
}

export class CaptchaBridge {
	private channel: RequestResponseChannel;
	private deps: Required<Omit<CaptchaBridgeDeps, 'controller'>>;
	private installedHandlers: Array<() => void> = [];
	private hookReadyListener: ((e: MessageEvent) => void) | null = null;
	private stats: CaptchaStats = {
		byType: {},
		unauthorizedCount: 0,
		hookReadyCount: 0
	};
	private pending = new Map<string, PendingSolve>();
	/**
	 * Reply ports indexed by the message-event source (the proxied
	 * window). Populated by the hook-ready handshake. Entries are
	 * `WeakMap`-keyed by source so they're cleaned up automatically when
	 * the proxied window is garbage-collected.
	 */
	private replyPorts: WeakMap<MessageEventSource, MessagePort> =
		new WeakMap();

	constructor(deps: CaptchaBridgeDeps = {}) {
		// `deps.controller` is accepted in the type but currently unused
		// by the bridge (the MessageChannel handshake means we don't have
		// to walk `controller.frames` to route replies). Kept in the
		// type so installers can pass it without churning when we light
		// up future features that need it (e.g. per-frame stats).
		void deps.controller;
		this.channel = new RequestResponseChannel({
			reqMarker: REQ_MARKER,
			resMarker: RES_MARKER,
			replyTransport: this.makeReplyTransport()
		});
		this.deps = {
			checkNightPlusStatus: deps.checkNightPlusStatus ?? checkNightPlusStatus,
			solveCaptcha: deps.solveCaptcha ?? solveCaptcha
		};
	}

	/**
	 * Build a reply transport that prefers the per-source MessagePort
	 * (set up via the hook-ready handshake — see `hook.runtime.js`),
	 * falling back to direct `source.postMessage` for sources we never
	 * received a port from (e.g. internal `ddx://` pages that don't run
	 * the proxied hook, or tests that synthesize MessageEvents).
	 *
	 * Why ports?
	 * ----------
	 * Scramjet's `Window.postMessage` proxy on proxied realms is
	 * miscompiled for outer-realm callers: when the host calls
	 * `proxiedWindow.postMessage(...)`, the wrapper steals `Function`
	 * from the host's pollutant, looks up scramjet's client symbol on
	 * the host's globalThis (which doesn't have it), and crashes with
	 * "Cannot read properties of undefined (reading 'url')". Affected
	 * pages we've seen: `dash.cloudflare.com`. The crash also breaks
	 * the unrelated `eventsBridge.postEventToIframe` host→page
	 * broadcaster, so it's a scramjet-side bug.
	 *
	 * `MessagePort.prototype.postMessage` is wrapped only INSIDE the
	 * proxied realm; the host realm's MessagePort is the native
	 * implementation, which has no scramjet trap. Reply via port =
	 * never enters the buggy wrapper.
	 */
	private makeReplyTransport(): ReplyTransport {
		return (source, wrapped) => {
			if (!source) return;

			// Path A: we have a port for this source from the handshake.
			const port = this.replyPorts.get(source);
			if (port) {
				try {
					port.postMessage(wrapped);
					return;
				} catch (err) {
					console.warn(
						'[captcha-bridge] port reply failed, falling back to direct:',
						err
					);
				}
			}

			// Path B: no port (internal page, test, or handshake hasn't
			// arrived yet). Use direct postMessage; may crash inside
			// scramjet on some pages (see jsdoc above). The channel
			// catches errors and logs.
			(source as Window).postMessage(wrapped, '*');
		};
	}

	/**
	 * Mount the message listener and register per-type handlers.
	 * Idempotent — second call is a no-op. Returns a teardown
	 * function for test cleanup.
	 */
	install(): () => void {
		// Each known type registers the same handler — the per-type
		// breakdown keeps the wire-protocol simple (no array dispatch).
		const handler = this.makeHandler();
		for (const type of KNOWN_TYPES) {
			this.installedHandlers.push(
				this.channel.registerHandler(type, handler)
			);
		}
		this.channel.install();

		// Separate listener for the hook-ready ping. Two jobs:
		//   1. Diagnostic counter for `window.captcha.stats()`.
		//   2. Capture the MessagePort the hook ships in `event.ports[0]`.
		//      That port is how we route replies back without tripping
		//      scramjet's buggy Window.postMessage wrapper. See
		//      `makeReplyTransport`.
		this.hookReadyListener = (event: MessageEvent) => {
			if (event.source === window) return;
			// Unwrap scramjet's envelope if present (see
			// `RequestResponseChannel.onMessage` for context). Without
			// this, hook-ready messages from proxied pages — which arrive
			// as `{$scramjet$messagetype, $scramjet$data: {...}}` — never
			// match our marker check and the port handshake is dropped.
			const raw = event?.data as
				| Record<string, unknown>
				| null
				| undefined;
			if (!raw || typeof raw !== 'object') return;
			const data =
				'$scramjet$messagetype' in raw &&
				raw.$scramjet$data &&
				typeof raw.$scramjet$data === 'object'
					? (raw.$scramjet$data as Record<string, unknown>)
					: raw;
			const payload = data[HOOK_READY_MARKER] as
				| { pageUrl?: string; at?: number }
				| undefined;
			if (!payload || typeof payload !== 'object') return;
			this.stats.hookReadyCount += 1;

			// Stash the reply port keyed by source. WeakMap'd so it
			// auto-clears when the proxied window goes away.
			const port = event.ports?.[0];
			if (port && event.source) {
				try {
					port.start();
				} catch {
					// Some implementations auto-start; ignore.
				}
				this.replyPorts.set(event.source, port);
			}

			try {
				console.log(
					'[captcha-bridge] hook ready in',
					payload.pageUrl,
					'at',
					payload.at,
					'port:',
					port ? 'attached' : 'none'
				);
			} catch {}
		};
		window.addEventListener('message', this.hookReadyListener);

		return () => this.uninstall();
	}

	uninstall(): void {
		for (const dispose of this.installedHandlers) {
			try {
				dispose();
			} catch {}
		}
		this.installedHandlers = [];
		this.channel.uninstall();
		if (this.hookReadyListener) {
			window.removeEventListener('message', this.hookReadyListener);
			this.hookReadyListener = null;
		}
	}

	getStats(): CaptchaStats {
		// Return a shallow copy so callers can't mutate our internal state.
		return {
			byType: Object.fromEntries(
				Object.entries(this.stats.byType).map(([k, v]) => [k, { ...v }])
			),
			unauthorizedCount: this.stats.unauthorizedCount,
			hookReadyCount: this.stats.hookReadyCount
		};
	}

	/**
	 * Return a shallow copy of currently in-flight solve requests.
	 * Each entry's `startedAt` is the ms-epoch timestamp; consumers
	 * compute age as `Date.now() - startedAt`.
	 */
	getPending(): PendingSolve[] {
		return [...this.pending.values()].map((p) => ({ ...p }));
	}

	// ---------- internals ----------

	private bumpStat(
		type: string,
		bucket: 'requested' | 'solved' | 'failed'
	): void {
		const slot = this.stats.byType[type] ?? {
			requested: 0,
			solved: 0,
			failed: 0
		};
		slot[bucket] += 1;
		this.stats.byType[type] = slot;
	}

	private makeHandler(): RequestHandler {
		return async (envelope) => {
			const req = envelope as unknown as SolveRequest;
			const { requestId, type } = req;
			if (typeof requestId !== 'string' || typeof type !== 'string') {
				try {
					console.warn(
						'[captcha-bridge] malformed_request — missing requestId or type',
						envelope
					);
				} catch {}
				throw new Error('malformed_request');
			}
			try {
				console.log(
					`[captcha-bridge] received ${type} solve request`,
					{
						requestId,
						sitekey: typeof req.sitekey === 'string' ? req.sitekey.slice(0, 32) : null,
						pageUrl: req.pageUrl,
						invisible: req.invisible,
						enterprise: req.enterprise
					}
				);
			} catch {}
			this.bumpStat(type, 'requested');
			this.pending.set(requestId, {
				requestId,
				type,
				sitekey: typeof req.sitekey === 'string' ? req.sitekey : '',
				startedAt: Date.now()
			});

			try {
				const authed = await this.deps.checkNightPlusStatus();
				if (!authed) {
					this.stats.unauthorizedCount += 1;
					try {
						console.warn(
							`[captcha-bridge] ${type} ${requestId} → UNAUTHORIZED (Night+ required)`
						);
					} catch {}
					// Throwing here makes RequestResponseChannel reply
					// `{ok:false, error:'unauthorized'}` — exactly what the
					// hook expects to invoke the page's error-callback.
					// The outer catch increments `failed` for us; we don't
					// double-count here.
					throw new Error('unauthorized');
				}

				try {
					console.log(
						`[captcha-bridge] ${type} ${requestId} → calling backend solveCaptcha...`
					);
				} catch {}
				const token = await this.deps.solveCaptcha(req);
				this.bumpStat(type, 'solved');
				try {
					console.log(
						`[captcha-bridge] ${type} ${requestId} → SOLVED (token ${token.length} chars)`
					);
				} catch {}
				return token;
			} catch (err) {
				this.bumpStat(type, 'failed');
				try {
					const msg = err instanceof Error ? err.message : String(err);
					console.warn(
						`[captcha-bridge] ${type} ${requestId} → FAILED: ${msg}`
					);
				} catch {}
				throw err;
			} finally {
				this.pending.delete(requestId);
			}
		};
	}
}
