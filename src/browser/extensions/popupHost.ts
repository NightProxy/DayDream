
import type { ExtensionContext } from '@core/helium';
import type { ExtensionBridgeChannel } from '@core/helium';

let currentPopup: HTMLDivElement | null = null;
let currentPopupOwner: { extId: string; win: Window; channel: ExtensionBridgeChannel | null } | null = null;
let dismissHandler: ((e: MouseEvent) => void) | null = null;

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
		width: '380px',
		minHeight: '80px',
		maxHeight: '600px',
		boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
		background: 'rgba(28,28,32,0.97)',
		border: '1px solid rgba(255,255,255,0.06)',
		borderRadius: '10px',
		overflow: 'hidden',
		backdropFilter: 'blur(8px)',
	} as Partial<CSSStyleDeclaration>);

	const rect = opts.anchorEl.getBoundingClientRect();
	const viewportH = window.innerHeight;
	const desiredTop = rect.bottom + 4;
	if (desiredTop + 200 > viewportH) {
		wrapper.style.bottom = `${viewportH - rect.top + 4}px`;
	} else {
		wrapper.style.top = `${desiredTop}px`;
	}
	const desiredLeft = rect.left;
	const viewportW = window.innerWidth;
	if (desiredLeft + 380 > viewportW - 8) {
		wrapper.style.left = `${Math.max(8, viewportW - 380 - 8)}px`;
	} else {
		wrapper.style.left = `${desiredLeft}px`;
	}

	const iframe = document.createElement('iframe');
	iframe.style.width = '100%';
	iframe.style.height = '100%';
	iframe.style.minHeight = '120px';
	iframe.style.border = 'none';
	iframe.style.background = 'transparent';
	iframe.dataset['heliumPopupExtId'] = opts.extId;
	wrapper.appendChild(iframe);

	document.body.appendChild(wrapper);
	currentPopup = wrapper;

	void spawnPopupFrame(iframe, opts)
		.then((channel) => {
			tryRegisterPopupWindow(opts.extId, iframe, channel);
			iframe.addEventListener('load', () => {
				tryRegisterPopupWindow(opts.extId, iframe, channel);
			}, { once: false });
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

export function closeExtensionPopup(): void {
	if (!currentPopup) return;
	if (dismissHandler) {
		document.removeEventListener('click', dismissHandler);
		dismissHandler = null;
	}
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
