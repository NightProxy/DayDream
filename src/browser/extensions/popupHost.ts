
import type { ExtensionContext } from '@core/helium';
import type { ExtensionBridgeChannel } from '@core/helium';

/**
 * Popup sizing bounds. Chrome's own popup autosizes to body content
 * clamped to 800×600. We use a slightly tighter width (380) that
 * matches most real extensions (uBlock Origin, Bitwarden, etc.), but
 * mirror Chrome's 600px height ceiling. `minHeight` is the pre-load
 * placeholder — the resize channel below shrinks or grows the wrapper
 * once the popup document reports its scrollHeight.
 */
const POPUP_WIDTH = 380;
const POPUP_MIN_HEIGHT = 120;
const POPUP_MAX_HEIGHT = 600;
const POPUP_ANCHOR_GAP = 4;
const POPUP_EDGE_MARGIN = 8;

let currentPopup: HTMLDivElement | null = null;
let currentPopupOwner: { extId: string; win: Window; channel: ExtensionBridgeChannel | null } | null = null;
let currentPopupIframe: HTMLIFrameElement | null = null;
let dismissHandler: ((e: MouseEvent) => void) | null = null;
let resizeMessageHandler: ((e: MessageEvent) => void) | null = null;

export interface OpenExtensionPopupOpts {
	extId: string;
	ctx: ExtensionContext;
	popupPath: string;
	anchorEl: HTMLElement;
}

export function openExtensionPopup(opts: OpenExtensionPopupOpts): void {
	closeExtensionPopup();

	const wrapper = document.createElement('div');
	wrapper.className = 'extension-popup-wrapper';
	Object.assign(wrapper.style, {
		position: 'fixed',
		zIndex: '2147483647',
		width: `${POPUP_WIDTH}px`,
		height: `${POPUP_MIN_HEIGHT}px`,
		maxHeight: `${POPUP_MAX_HEIGHT}px`,
		boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
		background: 'rgba(28,28,32,0.97)',
		border: '1px solid rgba(255,255,255,0.06)',
		borderRadius: '10px',
		overflow: 'hidden',
	} as Partial<CSSStyleDeclaration>);

	positionWrapper(wrapper, opts.anchorEl);

	const iframe = document.createElement('iframe');
	iframe.style.width = '100%';
	iframe.style.height = '100%';
	iframe.style.border = 'none';
	iframe.style.background = 'transparent';
	iframe.dataset['heliumPopupExtId'] = opts.extId;
	wrapper.appendChild(iframe);

	document.body.appendChild(wrapper);
	currentPopup = wrapper;
	currentPopupIframe = iframe;

	// Auto-size the wrapper to whatever the popup's document reports.
	// See `bootstrap/client.ts` — the popup bootstrap ResizeObserves
	// `documentElement` and postMessages `{__helium_popup_size__, w, h}`
	// on every layout change. We filter by iframe.contentWindow so a
	// second popup can't drive the size of the first one.
	resizeMessageHandler = (e: MessageEvent) => {
		if (!currentPopup || !currentPopupIframe) return;
		if (e.source !== currentPopupIframe.contentWindow) return;
		const data = e.data as { __helium_popup_size__?: unknown; w?: unknown; h?: unknown } | null;
		if (!data || data.__helium_popup_size__ !== true) return;
		const h = typeof data.h === 'number' ? data.h : NaN;
		if (!Number.isFinite(h) || h <= 0) return;
		const clamped = Math.min(POPUP_MAX_HEIGHT, Math.max(POPUP_MIN_HEIGHT, Math.ceil(h)));
		currentPopup.style.height = `${clamped}px`;
		// Re-run positioning so a grown popup that overflows the
		// bottom edge flips above the anchor.
		positionWrapper(currentPopup, opts.anchorEl);
	};
	window.addEventListener('message', resizeMessageHandler);

	void spawnPopupFrame(iframe, opts)
		.then((channel) => {
			tryRegisterPopupWindow(opts.extId, iframe, channel);
			iframe.addEventListener('load', () => {
				tryRegisterPopupWindow(opts.extId, iframe, channel);
			}, { once: true });
			tryRegisterPopupTarget(opts.extId, iframe);
		})
		.catch((err) => {
			console.warn('[helium/popupHost] spawn failed:', err);
		});

	dismissHandler = (e: MouseEvent) => {
		if (!wrapper.contains(e.target as Node) && !opts.anchorEl.contains(e.target as Node)) {
			closeExtensionPopup();
		}
	};
	setTimeout(() => {
		if (dismissHandler) document.addEventListener('click', dismissHandler);
	}, 0);
}

/**
 * Position `wrapper` relative to `anchorEl`, keeping the popup fully
 * inside the viewport. Prefers below the anchor, flips above if there
 * isn't room. Both dimensions clamp to `POPUP_EDGE_MARGIN` on all
 * sides so a popup near any viewport edge can't render off-screen.
 *
 * Reads `wrapper.style.height` if set (post-resize); falls back to the
 * min-height placeholder for the initial placement.
 */
function positionWrapper(wrapper: HTMLDivElement, anchorEl: HTMLElement): void {
	const rect = anchorEl.getBoundingClientRect();
	const viewportH = window.innerHeight;
	const viewportW = window.innerWidth;

	const parsedH = parseInt(wrapper.style.height || '', 10);
	const currentH = Number.isFinite(parsedH) && parsedH > 0 ? parsedH : POPUP_MIN_HEIGHT;

	// Vertical: try below anchor, flip above if no room, then clamp.
	// Clear whichever coordinate we're not using so re-positioning
	// after a resize doesn't leave both `top` and `bottom` set.
	const spaceBelow = viewportH - rect.bottom - POPUP_ANCHOR_GAP;
	const spaceAbove = rect.top - POPUP_ANCHOR_GAP;
	if (spaceBelow >= currentH || spaceBelow >= spaceAbove) {
		const top = Math.max(
			POPUP_EDGE_MARGIN,
			Math.min(rect.bottom + POPUP_ANCHOR_GAP, viewportH - currentH - POPUP_EDGE_MARGIN),
		);
		wrapper.style.top = `${top}px`;
		wrapper.style.bottom = '';
	} else {
		const bottom = Math.max(
			POPUP_EDGE_MARGIN,
			Math.min(viewportH - rect.top + POPUP_ANCHOR_GAP, viewportH - currentH - POPUP_EDGE_MARGIN),
		);
		wrapper.style.bottom = `${bottom}px`;
		wrapper.style.top = '';
	}

	// Horizontal: left-align to anchor, clamp to both viewport edges.
	const desiredLeft = rect.left;
	const left = Math.max(
		POPUP_EDGE_MARGIN,
		Math.min(desiredLeft, viewportW - POPUP_WIDTH - POPUP_EDGE_MARGIN),
	);
	wrapper.style.left = `${left}px`;
}

export function closeExtensionPopup(): void {
	if (!currentPopup) return;
	if (dismissHandler) {
		document.removeEventListener('click', dismissHandler);
		dismissHandler = null;
	}
	if (resizeMessageHandler) {
		window.removeEventListener('message', resizeMessageHandler);
		resizeMessageHandler = null;
	}
	currentPopupIframe = null;
	if (currentPopupOwner) {
		const owner = currentPopupOwner;
		const w = window as { extensions?: { unregisterPopupWindow?: (extId: string, win: Window) => void } };
		try {
			w.extensions?.unregisterPopupWindow?.(owner.extId, owner.win);
		} catch (err) {
			console.warn('[helium/popupHost] unregisterPopupWindow threw:', err);
		}
		try {
			const w2 = window as {
				extDevtools?: import('@apis/devtools/extensionManager').ExtensionDevToolsManager;
			};
			w2.extDevtools?.targetRegistry.unregister(owner.extId, 'popup');
		} catch (err) {
			console.warn('[helium/popupHost] unregister popup target threw:', err);
		}
		if (owner.channel) {
			try {
				owner.channel.close();
			} catch (err) {
				console.warn('[helium/popupHost] channel.close threw:', err);
			}
		}
		currentPopupOwner = null;
	}
	currentPopup.remove();
	currentPopup = null;
}

function tryRegisterPopupTarget(extId: string, iframe: HTMLIFrameElement): void {
	try {
		const w = window as {
			extDevtools?: import('@apis/devtools/extensionManager').ExtensionDevToolsManager;
		};
		if (!w.extDevtools) return;
		w.extDevtools.targetRegistry.register({
			extId,
			targetId: 'popup',
			kind: 'popup',
			iframe,
			label: 'Popup',
		});
	} catch (err) {
		console.warn('[helium/popupHost] register popup target threw:', err);
	}
}

function tryRegisterPopupWindow(
	extId: string,
	iframe: HTMLIFrameElement,
	channel: ExtensionBridgeChannel | null,
): void {
	const win = iframe.contentWindow;
	if (!win) return;
	if (currentPopupOwner && currentPopupOwner.win === win && currentPopupOwner.extId === extId) {
		return;
	}
	currentPopupOwner = { extId, win, channel };
	const w = window as { extensions?: { registerPopupWindow?: (extId: string, win: Window) => void } };
	try {
		w.extensions?.registerPopupWindow?.(extId, win);
	} catch (err) {
		console.warn('[helium/popupHost] registerPopupWindow threw:', err);
	}
}

/**
 * Spawn the Scramjet frame for the popup AND wire its
 * MessageChannel handshake so the popup's bootstrap can talk to the
 * host (so `chrome.runtime.sendMessage`, `chrome.storage.local.get`,
 * etc. actually work inside the popup realm).
 *
 * Returns the popup's ExtensionBridgeChannel so the caller can close
 * it when the popup is dismissed. May return null if the extension
 * is not currently running (no ctx → no plugin → no point).
 */
async function spawnPopupFrame(
	iframe: HTMLIFrameElement,
	opts: OpenExtensionPopupOpts,
): Promise<ExtensionBridgeChannel | null> {
	const w = window as {
		proxy?: { createFrame: (i: HTMLIFrameElement, o: unknown) => Promise<{ go: (url: string) => unknown }> };
		extensions?: {
			createExtensionPlugin?: (extId: string) => unknown;
			wireAuxiliaryViewChannel?: (
				ctx: ExtensionContext,
				iframe: HTMLIFrameElement,
				opts?: { isBackground: boolean },
			) => ExtensionBridgeChannel;
		};
	};

	if (!w.proxy?.createFrame) {
		console.warn('[helium/popupHost] proxy.createFrame unavailable');
		return null;
	}

	const url = `https://${opts.ctx.origin}/${opts.popupPath.replace(/^\/+/, '')}`;

	let plugin: unknown = null;
	try {
		plugin = w.extensions?.createExtensionPlugin?.(opts.extId) ?? null;
	} catch (err) {
		console.warn('[helium/popupHost] createExtensionPlugin threw:', err);
	}

	if (!plugin) {
		console.warn(
			'[helium/popupHost] no HeliumExtensionPlugin for extId=' +
				opts.extId +
				' — popup HTML will fail to load (extension not running?)',
		);
		return null;
	}

	let channel: ExtensionBridgeChannel | null = null;
	if (typeof w.extensions?.wireAuxiliaryViewChannel === 'function') {
		try {
			channel = w.extensions.wireAuxiliaryViewChannel(opts.ctx, iframe, { isBackground: false });
		} catch (err) {
			console.warn('[helium/popupHost] wireAuxiliaryViewChannel threw:', err);
		}
	} else {
		console.warn(
			'[helium/popupHost] window.extensions.wireAuxiliaryViewChannel unavailable — popup will load but `chrome.*` RPCs will hang',
		);
	}

	const frameOpts: { plugins?: unknown[] } = { plugins: [plugin] };
	const frame = await w.proxy.createFrame(iframe, frameOpts);
	frame.go(url);
	return channel;
}
